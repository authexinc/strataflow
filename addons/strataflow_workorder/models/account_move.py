from odoo import api, fields, models


class AccountMove(models.Model):
    _inherit = 'account.move'

    strataflow_workorder_ids = fields.One2many('strataflow.workorder', 'move_id', 'Locate tickets')
    strataflow_workorder_count = fields.Integer(compute='_compute_strataflow_workorder_count')

    @api.depends('strataflow_workorder_ids')
    def _compute_strataflow_workorder_count(self):
        for move in self:
            move.strataflow_workorder_count = len(move.strataflow_workorder_ids)

    def action_view_strataflow_workorders(self):
        self.ensure_one()
        action = self.env['ir.actions.act_window']._for_xml_id('strataflow_workorder.action_strataflow_workorder_records')
        action['domain'] = [('move_id', '=', self.id)]
        return action

    def _strataflow_status(self, today):
        self.ensure_one()
        if self.state == 'draft':
            return 'draft'
        if self.payment_state in ('paid', 'in_payment', 'reversed'):
            return 'paid'
        if self.invoice_date_due and self.invoice_date_due < today:
            return 'overdue'
        return 'sent'

    @api.model
    def get_invoice_board(self):
        """Stat cards + rows for the Strataflow Invoices screen, from real customer invoices."""
        today = fields.Date.context_today(self)
        month_start = today.replace(day=1)
        moves = self.search([('move_type', '=', 'out_invoice'), ('state', '!=', 'cancel')])
        rows = []
        for m in moves:
            status = m._strataflow_status(today)
            tickets = m.strataflow_workorder_ids.mapped('name') or [x.strip() for x in (m.invoice_origin or '').split(',') if x.strip()]
            rows.append({
                'id': m.id, 'name': m.name if m.state == 'posted' else (m.name or 'Draft'),
                'customer': m.partner_id.name, 'tickets': tickets,
                'issued': fields.Date.to_string(m.invoice_date) if m.invoice_date else '',
                'due': fields.Date.to_string(m.invoice_date_due) if m.invoice_date_due else '',
                'amount': m.amount_total, 'residual': m.amount_residual, 'status': status,
                'currency': m.currency_id.symbol or '$',
            })
        open_rows = [r for r in rows if r['status'] in ('draft', 'sent', 'overdue')]
        overdue = [r for r in rows if r['status'] == 'overdue']
        paid_month = moves.filtered(lambda m: m._strataflow_status(today) == 'paid' and m.invoice_date and m.invoice_date >= month_start)
        oldest = max([(today - fields.Date.from_string(r['due'])).days for r in overdue if r['due']], default=0)
        uninvoiced = self.env['strataflow.workorder'].search_count([('status', '=', 'closed'), ('move_id', '=', False)])
        rate = self.env.ref('strataflow_workorder.product_locate').lst_price
        return {
            'stats': {
                'outstanding': sum(r['residual'] for r in open_rows), 'outstanding_count': len(open_rows),
                'overdue': sum(r['residual'] for r in overdue), 'overdue_count': len(overdue), 'oldest_overdue_days': oldest,
                'paid_month': sum(paid_month.mapped('amount_total')),
                'uninvoiced_count': uninvoiced, 'uninvoiced_amount': uninvoiced * rate,
            },
            'invoices': rows,
            'month': today.strftime('%B %Y'),
            'currency': self.env.company.currency_id.symbol or '$',
        }
