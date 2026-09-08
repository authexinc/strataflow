{
    'name': 'Strataflow Work Orders',
    'summary': 'Strataline glass shell for locate companies: home, dispatch, work orders, CRM, invoices, locator field view',
    'version': '19.0.1.0.0',
    'category': 'Services/Field Service',
    'author': 'Strataline',
    'website': 'https://strataline.co',
    'license': 'LGPL-3',
    'depends': ['base', 'web', 'mail', 'contacts', 'crm', 'account', 'product'],
    'external_dependencies': {'python': ['reportlab']},
    'data': [
        'security/strataflow_security.xml',
        'security/ir.model.access.csv',
        'data/strataflow_utility_data.xml',
        'data/ir_sequence_data.xml',
        'data/strataflow_crm_account_data.xml',
        'views/strataflow_actions.xml',
        'views/strataflow_workorder_views.xml',
    ],
    'demo': [
        'demo/strataflow_workorder_demo.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'strataflow_workorder/static/src/**/*.scss',
            'strataflow_workorder/static/src/**/*.js',
            'strataflow_workorder/static/src/**/*.xml',
        ],
    },
    'post_init_hook': 'post_init_hook',
    'application': True,
    'installable': True,
}
