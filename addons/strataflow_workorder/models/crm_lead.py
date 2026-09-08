from odoo import api, fields, models


class CrmLead(models.Model):
    _inherit = 'crm.lead'

    strataflow_workorder_ids = fields.One2many('strataflow.workorder', 'lead_id', 'Locate tickets')
    strataflow_workorder_count = fields.Integer(compute='_compute_strataflow_workorder_count')

    @api.depends('strataflow_workorder_ids')
    def _compute_strataflow_workorder_count(self):
        for lead in self:
            lead.strataflow_workorder_count = len(lead.strataflow_workorder_ids)

    def action_view_strataflow_workorders(self):
        self.ensure_one()
        action = self.env['ir.actions.act_window']._for_xml_id('strataflow_workorder.action_strataflow_workorder_records')
        action['domain'] = [('lead_id', '=', self.id)]
        action['context'] = {'default_lead_id': self.id, 'default_requester_id': self.partner_id.id}
        return action

    @api.model
    def get_pipeline(self):
        """Kanban payload for the Strataflow CRM screen: stock stages, stock leads."""
        initials = self.env['strataflow.workorder']._initials
        stages = self.env['crm.stage'].search([])
        leads = self.search([('type', '=', 'opportunity')])
        now = fields.Datetime.now()
        return {
            'stages': [{'id': s.id, 'name': s.name, 'is_won': s.is_won} for s in stages],
            'leads': [
                {
                    'id': l.id, 'company': l.partner_id.commercial_partner_id.name or l.partner_name or l.name,
                    'summary': l.name, 'stage_id': l.stage_id.id,
                    'amount': l.expected_revenue, 'recurring': l.recurring_revenue, 'plan': l.recurring_plan.name or '',
                    'currency': l.company_currency.symbol or '$',
                    'tags': l.tag_ids.mapped('name'), 'owner': initials(l.user_id.name),
                    'age_days': (now - l.create_date).days if l.create_date else 0,
                    'tickets': l.strataflow_workorder_count,
                }
                for l in leads
            ],
        }
