import io

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas as rl_canvas

from odoo import http
from odoo.http import request

PX_TO_M = 0.15  # canvas scale used by the drawing tool


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

        # drawing box, scaled from canvas pixels
        drawing = wo.drawing or {}
        size = drawing.get('size') or {'w': 900, 'h': 470}
        box_w = width - 2 * margin
        box_h = box_w * (size['h'] / size['w'])
        box_h = min(box_h, y - margin - 22 * mm)
        scale = min(box_w / size['w'], box_h / size['h'])
        ox, oy = margin, y - box_h
        pdf.setStrokeColor(colors.HexColor('#bec1c8'))
        pdf.setFillColor(colors.HexColor('#f4f5f3'))
        pdf.roundRect(ox, oy, box_w, box_h, 4 * mm, stroke=1, fill=1)
        colours = {u.code: u.color for u in request.env['strataflow.utility'].search([])}
        letters = {u.code: u.name[0] for u in request.env['strataflow.utility'].search([])}

        def px(x, py):
            return ox + x * scale, oy + box_h - py * scale

        for seg in drawing.get('segments', []):
            colour = colors.HexColor(colours.get(seg.get('util'), '#1c2124'))
            pdf.setStrokeColor(colour)
            pdf.setLineWidth(2.2)
            pdf.setDash([1, 5] if seg.get('util') == 'gas' else [])
            x1, y1 = px(seg['x1'], seg['y1'])
            x2, y2 = px(seg['x2'], seg['y2'])
            pdf.line(x1, y1, x2, y2)
            pdf.setDash([])
            metres = ((seg['x2'] - seg['x1']) ** 2 + (seg['y2'] - seg['y1']) ** 2) ** 0.5 * PX_TO_M
            pdf.setFont('Courier-Bold', 7.5)
            pdf.setFillColor(colour)
            pdf.drawCentredString((x1 + x2) / 2, (y1 + y2) / 2 + 2 * mm, f"{letters.get(seg.get('util'), '?')} {metres:.1f} m")
        for note in drawing.get('notes', []):
            x, ny = px(note['x'], note['y'])
            pdf.setFillColor(colors.HexColor('#1c2124'))
            pdf.circle(x, ny, 1.4 * mm, stroke=0, fill=1)
            pdf.setFont('Courier-Bold', 7.5)
            pdf.drawString(x + 2.5 * mm, ny - 1 * mm, note.get('text', ''))

        # legend + disclaimer
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
        pdf.drawRightString(width - margin, ly, f'scale 1 px ≈ {PX_TO_M} m')
        pdf.showPage()
        pdf.save()
        return request.make_response(buf.getvalue(), headers=[
            ('Content-Type', 'application/pdf'),
            ('Content-Disposition', http.content_disposition(f'{wo.name}-locate.pdf')),
        ])
