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
        'views/strataflow_login.xml',
        'views/strataflow_workorder_views.xml',
    ],
    'demo': [
        'demo/strataflow_workorder_demo.xml',
    ],
    'assets': {
        # the stock views in the Strataline language (tenant-wide, light): prepended so they
        # land ahead of Odoo's and Bootstrap's `!default` declarations — appended they would
        # come after and change nothing. The material rules live in static/src/stock/stock.scss,
        # swept into web.assets_backend by the glob below.
        'web._assets_primary_variables': [
            ('prepend', 'strataflow_workorder/static/scss/backend_variables.scss'),
        ],
        'web._assets_backend_helpers': [
            ('prepend', 'strataflow_workorder/static/scss/backend_bootstrap.scss'),
        ],
        'web.assets_backend': [
            # tokens and mixins first: Odoo forbids @import between asset files, so every
            # bundle that uses them has to list this file ahead of its consumers
            'strataflow_workorder/static/scss/tokens.scss',
            'strataflow_workorder/static/src/**/*.scss',
            'strataflow_workorder/static/src/**/*.js',
            'strataflow_workorder/static/src/**/*.xml',
        ],
        # the sign-in page: kept out of static/src so the globs above never sweep it into
        # the backend bundle, where it would restyle every stock form control in the app
        'web.assets_frontend': [
            'strataflow_workorder/static/scss/tokens.scss',
            'strataflow_workorder/static/login/login.scss',
            'strataflow_workorder/static/login/login.js',
        ],
    },
    'post_init_hook': 'post_init_hook',
    'application': True,
    'installable': True,
}
