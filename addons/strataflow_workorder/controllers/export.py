import io
import math

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas as rl_canvas

from odoo import http
from odoo.http import request

# The drawing is geo-referenced ({v: 2, segments: [{a: [lng, lat], b, util}], notes: [{at, text}]});
# this mirrors static/src/core/locate_geo.js `projectDrawing` — keep the two in step.
M_PER_DEG_LAT = 111320
MIN_SPAN_M = 30
MAX_PT_PER_M = 8 * 72 / 96  # the JS caps at 12 px/m; same on paper in points


def haversine_m(a, b):
    lng1, lat1, lng2, lat2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(h))


def project_drawing(drawing, w, h, pad):
    """North-up print of the drawing in a w×h box (points): equirectangular around its own
    centre, scaled to fit. Returns (segments, notes, m_per_pt); pixel y grows downward."""
    if (drawing or {}).get('v') != 2:
        return [], [], 0
    segs = drawing.get('segments', [])
    notes = drawing.get('notes', [])
    pts = [p for s in segs for p in (s['a'], s['b'])] + [n['at'] for n in notes]
    if not pts:
        return [], [], 0
    lng0 = (min(p[0] for p in pts) + max(p[0] for p in pts)) / 2
    lat0 = (min(p[1] for p in pts) + max(p[1] for p in pts)) / 2
    m_per_deg_lng = M_PER_DEG_LAT * math.cos(math.radians(lat0))

    def to_m(p):
        return (p[0] - lng0) * m_per_deg_lng, -(p[1] - lat0) * M_PER_DEG_LAT

    ms = [to_m(p) for p in pts]
    span_x = max([MIN_SPAN_M] + [abs(x) * 2 for x, _ in ms])
    span_y = max([MIN_SPAN_M] + [abs(y) * 2 for _, y in ms])
    pt_per_m = min((w - 2 * pad) / span_x, (h - 2 * pad) / span_y, MAX_PT_PER_M)

    def to_pt(p):
        x, y = to_m(p)
        return w / 2 + x * pt_per_m, h / 2 + y * pt_per_m

    out_segs = [dict(a=to_pt(s['a']), b=to_pt(s['b']), util=s.get('util'), metres=haversine_m(s['a'], s['b'])) for s in segs]
    out_notes = [dict(at=to_pt(n['at']), text=n.get('text', '')) for n in notes]
    return out_segs, out_notes, 1 / pt_per_m


class StrataflowExport(http.Controller):

    @http.route('/strataflow/workorder/<int:wo_id>/locate.pdf', type='http', auth='user')
    def locate_pdf(self, wo_id, **kw):
        wo = request.env['strataflow.workorder'].browse(wo_id)
        wo.check_access('read')

        buf = io.BytesIO()
        pdf = rl_canvas.Canvas(buf, pagesize=letter)
        width, height = letter
        margin = 16 * mm
        y = height - margin

        # header
        pdf.setFillColor(colors.HexColor('#0f6ed8'))
        pdf.setFont('Courier-Bold', 9)
        pdf.drawString(margin, y, wo.name)
        y -= 7 * mm
        pdf.setFillColor(colors.black)
        pdf.setFont('Helvetica-Bold', 18)
        pdf.drawString(margin, y, wo.address)
        pdf.setFont('Helvetica', 9)
        pdf.setFillColor(colors.HexColor('#5b6167'))
        pdf.drawRightString(width - margin, y, 'Strataflow by Strataline · locate print')
        y -= 10 * mm

        # details grid
        rows = [
            ('Status', dict(wo._fields['status'].selection)[wo.status]),
            ('Dig date', wo.dig_date.strftime('%b %d, %Y') if wo.dig_date else ''),
            ('Source', dict(wo._fields['source'].selection)[wo.source]),
            ('Requested by', wo.requester_id.name or ''),
            ('Locator', wo.locator_id.name or '— unassigned'),
            ('Parcel', wo.parcel or ''),
            ('Utilities', ', '.join(wo.utility_ids.mapped('name'))),
        ]
        for label, value in rows:
            pdf.setFont('Helvetica-Bold', 7.5)
            pdf.setFillColor(colors.HexColor('#5b6167'))
            pdf.drawString(margin, y, label.upper())
            pdf.setFont('Courier', 9)
            pdf.setFillColor(colors.black)
            pdf.drawString(margin + 30 * mm, y, value)
            y -= 5.5 * mm
        y -= 4 * mm

        # the print: north-up, fitted into the box
        box_w = width - 2 * margin
        box_h = min(box_w * 0.52, y - margin - 22 * mm)
        ox, oy = margin, y - box_h
        pdf.setStrokeColor(colors.HexColor('#bec1c8'))
        pdf.setFillColor(colors.HexColor('#f4f5f3'))
        pdf.roundRect(ox, oy, box_w, box_h, 4 * mm, stroke=1, fill=1)
        utilities = request.env['strataflow.utility'].search([])
        colours = {u.code: u.color for u in utilities}
        letters = {u.code: u.name[0] for u in utilities}
        segs, notes, m_per_pt = project_drawing(wo.drawing, box_w, box_h, 10 * mm)

        def pt(p):
            return ox + p[0], oy + box_h - p[1]

        for seg in segs:
            colour = colors.HexColor(colours.get(seg['util'], '#1c2124'))
            pdf.setStrokeColor(colour)
            pdf.setLineWidth(2.2)
            pdf.setDash([1, 5] if seg['util'] == 'gas' else [])
            x1, y1 = pt(seg['a'])
            x2, y2 = pt(seg['b'])
            pdf.line(x1, y1, x2, y2)
            pdf.setDash([])
            pdf.setFont('Courier-Bold', 7.5)
            pdf.setFillColor(colour)
            pdf.drawCentredString((x1 + x2) / 2, (y1 + y2) / 2 + 2 * mm, f"{letters.get(seg['util'], '?')} {seg['metres']:.1f} m")
        for note in notes:
            x, ny = pt(note['at'])
            pdf.setFillColor(colors.HexColor('#1c2124'))
            pdf.circle(x, ny, 1.4 * mm, stroke=0, fill=1)
            pdf.setFont('Courier-Bold', 7.5)
            pdf.drawString(x + 2.5 * mm, ny - 1 * mm, note['text'])
        if not segs and not notes:
            pdf.setFillColor(colors.HexColor('#8b9294'))
            pdf.setFont('Courier-Bold', 10)
            pdf.drawCentredString(ox + box_w / 2, oy + box_h / 2, 'nothing drawn yet')

        # legend + scale + disclaimer
        ly = oy - 6 * mm
        lx = margin
        for code, colour in colours.items():
            pdf.setFillColor(colors.HexColor(colour))
            pdf.circle(lx + 1.2 * mm, ly + 1 * mm, 1.2 * mm, stroke=0, fill=1)
            pdf.setFillColor(colors.HexColor('#3a4045'))
            pdf.setFont('Helvetica', 7.5)
            pdf.drawString(lx + 4 * mm, ly, code.capitalize())
            lx += 22 * mm
        pdf.setFillColor(colors.HexColor('#5b6167'))
        pdf.setFont('Courier', 7)
        scale = f'north up · 10 mm ≈ {10 * mm * m_per_pt:.1f} m' if m_per_pt else 'north up'
        pdf.drawRightString(width - margin, ly, scale)
        pdf.drawString(margin, ly - 5 * mm, 'Reference only — not a locate. The field locate governs.')

        pdf.showPage()
        pdf.save()
        return request.make_response(buf.getvalue(), headers=[
            ('Content-Type', 'application/pdf'),
            ('Content-Disposition', http.content_disposition(f'{wo.name}-locate.pdf')),
        ])
