from datetime import timedelta

from odoo import _, api, fields, models
from odoo.exceptions import UserError

STATUSES = [
    ('new', 'New'),
    ('assigned', 'Assigned'),
    ('onsite', 'On site'),
    ('located', 'Located'),
    ('closed', 'Closed'),
    ('invoiced', 'Invoiced'),
]
# status -> (next status, timestamp field stamped on the way)
NEXT_STEP = {
    'assigned': ('onsite', 'onsite_at'),
    'onsite': ('located', 'located_at'),
    'located': ('closed', 'closed_at'),
    'closed': ('invoiced', None),
}
OPEN_STATUSES = ('new', 'assigned', 'onsite')


class StrataflowWorkOrder(models.Model):
    _name = 'strataflow.workorder'
    _description = 'Locate Work Order'
    _inherit = ['mail.thread', 'mail.activity.mixin']
    _order = 'emergency desc, dig_date, id desc'

    name = fields.Char('Ticket', required=True, copy=False, readonly=True, default=lambda self: _('New'))
    address = fields.Char(required=True)
    lld = fields.Char('Legal land description', help='ATS quarter-section-township-range-meridian for rural dispatch')
    parcel = fields.Char(help='Plan / block / lot')
    latitude = fields.Float(digits=(10, 7))
    longitude = fields.Float(digits=(10, 7))
    status = fields.Selection(STATUSES, default='new', required=True, index=True, tracking=True)
    emergency = fields.Boolean(help='Emergency locate: jumps the queue everywhere', tracking=True)
    dig_date = fields.Date(required=True, default=fields.Date.context_today, tracking=True)
    source = fields.Selection([('usp', 'USP feed'), ('manual', 'Manual entry')], default='manual', required=True)
    requester_id = fields.Many2one('res.partner', 'Requested by', tracking=True)
    lead_id = fields.Many2one('crm.lead', 'Opportunity', help='The CRM deal this work belongs to; defaults to the requester\'s won opportunity')
    contact = fields.Char('Site contact')
    scope_note = fields.Text()
    locator_id = fields.Many2one('res.users', 'Locator', tracking=True, domain=lambda self: [('group_ids', 'in', self.env.ref('strataflow_workorder.group_strataflow_user').id)])
    utility_ids = fields.Many2many('strataflow.utility', string='Utilities')
    # the locate print, geo-referenced (static/src/core/locate_geo.js):
    # {"v": 2, "segments": [{"a": [lng, lat], "b": [lng, lat], "util"}], "notes": [{"at": [lng, lat], "text"}]}
    drawing = fields.Json(default=dict)
    move_id = fields.Many2one('account.move', 'Invoice', readonly=True, copy=False)
    invoice_line_id = fields.Many2one('account.move.line', 'Invoice line', readonly=True, copy=False)

    received_at = fields.Datetime(default=fields.Datetime.now, readonly=True)
    assigned_at = fields.Datetime(readonly=True)
    assigned_by_id = fields.Many2one('res.users', readonly=True)
    onsite_at = fields.Datetime(readonly=True)
    located_at = fields.Datetime(readonly=True)
    closed_at = fields.Datetime(readonly=True)

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get('name', _('New')) == _('New'):
                vals['name'] = self.env['ir.sequence'].next_by_code('strataflow.workorder') or _('New')
            if vals.get('requester_id') and not vals.get('lead_id'):
                won = self.env['crm.lead'].search([
                    ('partner_id', 'child_of', vals['requester_id']), ('stage_id.is_won', '=', True),
                ], order='date_closed desc', limit=1)
                vals['lead_id'] = won.id or False
        return super().create(vals_list)

    def action_assign(self, locator_id):
        self.ensure_one()
        if self.status not in ('new', 'assigned'):
            raise UserError(_('Only new or assigned tickets can be (re)assigned.'))
        self.write({
            'locator_id': locator_id,
            'status': 'assigned',
            'assigned_at': fields.Datetime.now(),
            'assigned_by_id': self.env.user.id,
        })
        self.message_post(body=_('Assigned to %s', self.locator_id.name), message_type='notification', subtype_xmlid='mail.mt_note')
        return True

    @api.model
    def action_invoice_closed(self):
        """One draft customer invoice per requester for every closed, uninvoiced ticket."""
        product = self.env.ref('strataflow_workorder.product_locate')
        tickets = self.search([('status', '=', 'closed'), ('move_id', '=', False), ('requester_id', '!=', False)])
        moves = self.env['account.move']
        for partner in tickets.requester_id:
            batch = tickets.filtered(lambda t: t.requester_id == partner)
            move = self.env['account.move'].create({
                'move_type': 'out_invoice',
                'partner_id': partner.id,
                'invoice_origin': ', '.join(batch.mapped('name')),
                'invoice_line_ids': [(0, 0, {
                    'product_id': product.id,
                    'name': f'{t.name} · {t.address}',
                    'quantity': 1,
                    'price_unit': product.lst_price,
                }) for t in batch],
            })
            for t, line in zip(batch, move.invoice_line_ids.filtered('product_id')):
                t.write({'move_id': move.id, 'invoice_line_id': line.id, 'status': 'invoiced'})
                t.message_post(body=_('Invoiced on %s', move.name or move.display_name), message_type='notification', subtype_xmlid='mail.mt_note')
            moves |= move
        return {'created': len(moves), 'tickets': len(tickets), 'move_ids': moves.ids}

    def action_advance(self):
        """Move the ticket one step along the lifecycle and stamp when it happened."""
        self.ensure_one()
        if self.status not in NEXT_STEP:
            raise UserError(_('Ticket %s cannot be advanced from status %s.', self.name, self.status))
        nxt, stamp = NEXT_STEP[self.status]
        vals = {'status': nxt}
        if stamp:
            vals[stamp] = fields.Datetime.now()
        self.write(vals)
        return True

    def action_complete_locate(self):
        """Locator confirms the print from the field: the ticket becomes `located`.

        Closing is a dispatcher's act, not a field one — `closed` is what
        `action_invoice_closed` bills, so a single tap in the truck must not
        raise an invoice. The dispatcher closes from Work Orders (`action_advance`,
        `located` -> `closed`) after reviewing the print. Decided 2026-09-08.
        """
        self.ensure_one()
        if self.status not in ('assigned', 'onsite'):
            raise UserError(_('Ticket %s is not in progress.', self.name))
        if not (self.drawing or {}).get('segments'):
            raise UserError(_('Draw the locate before submitting the ticket.'))
        now = fields.Datetime.now()
        self.write({
            'status': 'located',
            'onsite_at': self.onsite_at or now,
            'located_at': now,
        })
        self.message_post(body=_('Locate completed on site; awaiting dispatcher review.'),
                          message_type='notification', subtype_xmlid='mail.mt_note')
        return True

    # ---- payloads for the client actions --------------------------------------

    @api.model
    def get_map_config(self):
        """What the browser needs to draw the live Strataline map: the service's
        origin and this tenant's scoped API key.

        The key goes to the browser on purpose (ARCHITECTURE.md › "Tile key
        exposure", Phase 1): strataline scopes it by bbox, sources, zoom, daily
        quota and registered origins, and echoes CORS only for those origins. It
        is sent as `?key=` on every tile/glyph request because strataline has no
        preflight handler, so a custom header would fail. Phase 2's provisioner
        writes both parameters when it mints the tenant's key; until then they
        are set by hand and `connected` is False, which the screens show as a
        "not connected" ground instead of a map.
        """
        icp = self.env['ir.config_parameter'].sudo()
        key = (icp.get_param('strataline.api_key') or '').strip()
        base = (icp.get_param('strataline.base_url') or 'https://strataline.co').rstrip('/')
        return {'connected': bool(key), 'base_url': base, 'api_key': key}

    @staticmethod
    def _initials(name):
        return ''.join(w[0] for w in (name or '').replace('.', ' ').split() if w)[:2].upper()

    def _is_dispatcher(self):
        return self.env.user.has_group('strataflow_workorder.group_strataflow_manager')

    def _ticket_payload(self, t):
        def dt(value):
            return fields.Datetime.to_string(value) if value else False

        return {
            'id': t.id, 'name': t.name, 'address': t.address, 'lld': t.lld or '', 'parcel': t.parcel or '',
            'latitude': t.latitude or None, 'longitude': t.longitude or None,
            'status': t.status, 'emergency': t.emergency, 'dig_date': fields.Date.to_string(t.dig_date),
            'source': dict(self._fields['source'].selection)[t.source],
            'requester': t.requester_id.name or '', 'contact': t.contact or '', 'scope_note': t.scope_note or '',
            'locator': {'id': t.locator_id.id, 'name': t.locator_id.name, 'initials': self._initials(t.locator_id.name)} if t.locator_id else None,
            'utility_ids': t.utility_ids.ids,
            'drawing': t.drawing or {},
            'invoice': t.move_id.name if t.move_id else '', 'move_id': t.move_id.id or None,
            'lead_id': t.lead_id.id or None,
            'received_at': dt(t.received_at), 'assigned_at': dt(t.assigned_at),
            'assigned_by': t.assigned_by_id.name or '',
            'onsite_at': dt(t.onsite_at), 'located_at': dt(t.located_at), 'closed_at': dt(t.closed_at),
        }

    @api.model
    def get_board_data(self):
        """Everything the Work Orders / Dispatch / Locator screens need in one round trip."""
        tickets = self.search([])
        locators = self.env.ref('strataflow_workorder.group_strataflow_user').user_ids.filtered(lambda u: not u.share).sorted('name')
        open_load = {}
        for t in tickets.filtered(lambda t: t.status in ('assigned', 'onsite') and t.locator_id):
            open_load[t.locator_id.id] = open_load.get(t.locator_id.id, 0) + 1
        busy = set(tickets.filtered(lambda t: t.status == 'onsite').locator_id.ids)
        me = self.env.user
        return {
            'me': {'id': me.id, 'name': me.name, 'initials': self._initials(me.name), 'is_dispatcher': self._is_dispatcher()},
            'utilities': [
                {'id': u.id, 'code': u.code, 'name': u.name, 'color': u.color}
                for u in self.env['strataflow.utility'].search([])
            ],
            'crew': sorted([
                {
                    'id': u.id, 'name': u.name, 'initials': self._initials(u.name),
                    'open': open_load.get(u.id, 0), 'busy': u.id in busy,
                }
                for u in locators
            ], key=lambda c: (c['busy'], c['open'], c['name'])),
            'tickets': [self._ticket_payload(t) for t in tickets],
        }

    @api.model
    def get_home_stats(self):
        today = fields.Date.context_today(self)
        tickets = self.search([])
        open_t = tickets.filtered(lambda t: t.status in OPEN_STATUSES)
        on_shift = tickets.filtered(lambda t: t.status in ('assigned', 'onsite') and t.dig_date <= today + timedelta(days=1)).locator_id
        stats = {
            'open': len(open_t),
            'emergency': len(open_t.filtered('emergency')),
            'due_today': len(open_t.filtered(lambda t: t.dig_date == today)),
            'unassigned': len(open_t.filtered(lambda t: not t.locator_id)),
            'on_site': len(open_t.filtered(lambda t: t.status == 'onsite')),
            'on_shift': len(on_shift),
        }
        if self._is_dispatcher():
            Lead = self.env['crm.lead']
            stats['leads'] = Lead.search_count([('type', '=', 'opportunity'), ('stage_id.is_won', '=', False)])
            stats['quotes'] = Lead.search_count([('type', '=', 'opportunity'), ('stage_id', '=', self.env.ref('crm.stage_lead3').id)])
            open_moves = self.env['account.move'].search([('move_type', '=', 'out_invoice'), ('state', '=', 'posted'), ('payment_state', 'in', ('not_paid', 'partial'))])
            stats['outstanding'] = sum(open_moves.mapped('amount_residual'))
            stats['uninvoiced'] = self.search_count([('status', '=', 'closed'), ('move_id', '=', False)])
        return stats

    # ---- demo helper (called from demo XML) -------------------------------------

    @api.model
    def _demo_seed_invoices(self):
        """Posted / paid / overdue customer invoices mirroring the design's Invoices seed."""
        Move = self.env['account.move']
        product = self.env.ref('strataflow_workorder.product_locate')
        ref = self.env.ref
        today = fields.Date.context_today(self)
        rows = [  # partner xmlid, ticket refs, issued offset days, amount, state
            ('partner_ledcor', ['T-04168', 'T-04164', 'T-04161', 'T-04157'], -3, 3240, 'sent'),
            ('partner_calgary', ['T-04155', 'T-04152', 'T-04150', 'T-04147', 'T-04145', 'T-04142', 'T-04139'], -4, 5480, 'sent'),
            ('partner_atco', ['T-26-04159'], -5, 920, 'paid'),
            ('partner_graham', ['T-04140', 'T-04138', 'T-04136'], -7, 2660, 'sent'),
            ('partner_whissell', ['T-04122', 'T-04121', 'T-04119', 'T-04117', 'T-04115', 'T-04113', 'T-04111', 'T-04109', 'T-04107'], -11, 7830, 'sent'),
            ('partner_fortis', ['T-04118', 'T-04116', 'T-04114', 'T-04112', 'T-04110'], -14, 4150, 'paid'),
            ('partner_marigold', ['T-04096', 'T-04094'], -25, 1380, 'overdue'),
            ('partner_prairie', ['T-04071'], -31, 450, 'overdue'),
            ('partner_volker', ['T-04044', 'T-04043', 'T-04041', 'T-04039', 'T-04037', 'T-04035'], -35, 7310, 'overdue'),
        ]
        for partner_xmlid, tickets, offset, amount, state in rows:
            issued = today + timedelta(days=offset)
            move = Move.create({
                'move_type': 'out_invoice',
                'partner_id': ref(f'strataflow_workorder.{partner_xmlid}').id,
                'invoice_date': issued,
                'invoice_date_due': issued + timedelta(days=30 if state != 'overdue' else 20),
                'invoice_origin': ', '.join(tickets),
                'invoice_line_ids': [(0, 0, {
                    'product_id': product.id, 'name': f'{t} · locate', 'quantity': 1,
                    'price_unit': round(amount / len(tickets), 2),
                }) for t in tickets],
            })
            if state != 'draft':
                move.action_post()
            if state == 'paid':
                self.env['account.payment.register'].with_context(
                    active_model='account.move', active_ids=move.ids,
                ).create({'payment_date': issued + timedelta(days=12)}).action_create_payments()
            if tickets == ['T-26-04159']:
                wo = self.search([('name', '=', 'T-26-04159')], limit=1)
                wo.write({'move_id': move.id, 'invoice_line_id': move.invoice_line_ids[:1].id})
        return True
