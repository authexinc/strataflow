from odoo import fields, models


class StrataflowUtility(models.Model):
    """A utility class a ticket asks to have marked. Colour follows APWA."""
    _name = 'strataflow.utility'
    _description = 'Utility to Locate'
    _order = 'sequence, id'

    name = fields.Char(required=True, translate=True)
    code = fields.Char(required=True)
    color = fields.Char(required=True, help='APWA marking colour, hex')
    sequence = fields.Integer(default=10)

    _code_uniq = models.Constraint('unique(code)', 'Utility codes must be unique.')
