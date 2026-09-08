{
    'name': 'Strataflow Work Orders',
    'summary': 'Locate tickets with the Strataline glass shell: list, detail, assignment and locate drawing',
    'version': '19.0.1.0.0',
    'category': 'Services/Field Service',
    'author': 'Strataline',
    'website': 'https://strataline.co',
    'license': 'LGPL-3',
    'depends': ['base', 'web'],
    'data': [
        'security/strataflow_security.xml',
        'security/ir.model.access.csv',
        'data/strataflow_utility_data.xml',
        'data/ir_sequence_data.xml',
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
    'application': True,
    'installable': True,
}
