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


class StrataflowWorkOrder(models.Model):
    _name = 'strataflow.workorder'
    _description = 'Locate Work Order'
    _order = 'dig_date, id desc'

    name = fields.Char('Ticket', required=True, copy=False, readonly=True, default=lambda self: _('New'))
    address = fields.Char(required=True)
    lld = fields.Char('Legal land description', help='ATS quarter-section-township-range-meridian for rural dispatch')
    latitude = fields.Float(digits=(10, 7))
    longitude = fields.Float(digits=(10, 7))
    status = fields.Selection(STATUSES, default='new', required=True, index=True)
    dig_date = fields.Date(required=True, default=fields.Date.context_today)
    source = fields.Selection([('usp', 'USP feed'), ('manual', 'Manual entry')], default='manual', required=True)
    requester_id = fields.Many2one('res.partner', 'Requested by')
    locator_id = fields.Many2one('res.users', 'Locator', domain=lambda self: [('group_ids', 'in', self.env.ref('strataflow_workorder.group_strataflow_user').id)])
    utility_ids = fields.Many2many('strataflow.utility', string='Utilities')
    # the locate print: {"segments": [{x1,y1,x2,y2,util}], "notes": [{x,y,text}]}, pixel space of the canvas
    drawing = fields.Json(default=dict)

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
        return True

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

    # ---- board payload for the client action -------------------------------

    @staticmethod
    def _initials(name):
        return ''.join(w[0] for w in (name or '').replace('.', ' ').split() if w)[:2].upper()

    @api.model
    def get_board_data(self):
        """Everything the Work Orders screen needs in one round trip."""
        tickets = self.search([])
        locators = self.env.ref('strataflow_workorder.group_strataflow_user').user_ids.sorted('name')
        open_load = {}
        for t in tickets.filtered(lambda t: t.status in ('assigned', 'onsite') and t.locator_id):
            open_load[t.locator_id.id] = open_load.get(t.locator_id.id, 0) + 1
        busy = set(tickets.filtered(lambda t: t.status == 'onsite').locator_id.ids)

        def dt(value):
            return fields.Datetime.to_string(value) if value else False

        return {
            'me': {'name': self.env.user.name, 'initials': self._initials(self.env.user.name)},
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
            'tickets': [
                {
                    'id': t.id, 'name': t.name, 'address': t.address, 'lld': t.lld or '',
                    'status': t.status, 'dig_date': fields.Date.to_string(t.dig_date),
                    'source': dict(self._fields['source'].selection)[t.source],
                    'requester': t.requester_id.name or '',
                    'locator': {'id': t.locator_id.id, 'name': t.locator_id.name, 'initials': self._initials(t.locator_id.name)} if t.locator_id else None,
                    'utility_ids': t.utility_ids.ids,
                    'drawing': t.drawing or {},
                    'received_at': dt(t.received_at), 'assigned_at': dt(t.assigned_at),
                    'assigned_by': t.assigned_by_id.name or '',
                    'onsite_at': dt(t.onsite_at), 'located_at': dt(t.located_at), 'closed_at': dt(t.closed_at),
                }
                for t in tickets
            ],
        }
