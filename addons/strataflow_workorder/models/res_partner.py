from odoo import api, fields, models


class ResPartner(models.Model):
    _inherit = 'res.partner'

    strataflow_workorder_ids = fields.One2many('strataflow.workorder', 'requester_id', 'Locate tickets')
    strataflow_workorder_count = fields.Integer(compute='_compute_strataflow_workorder_count')

    @api.depends('strataflow_workorder_ids')
    def _compute_strataflow_workorder_count(self):
        for partner in self:
            partner.strataflow_workorder_count = len(partner.strataflow_workorder_ids)

    def action_view_strataflow_workorders(self):
        self.ensure_one()
        action = self.env['ir.actions.act_window']._for_xml_id('strataflow_workorder.action_strataflow_workorder_records')
        action['domain'] = [('requester_id', 'child_of', self.id)]
        action['context'] = {'default_requester_id': self.id}
        return action
