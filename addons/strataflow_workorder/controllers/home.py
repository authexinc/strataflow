from odoo import http
from odoo.http import request
from odoo.addons.web.controllers.home import Home
from odoo.addons.web.controllers.utils import is_user_internal


class StrataflowHome(Home):
    """Land Strataflow users on the Home screen at the bare domain.

    Stock `/` redirects to `/odoo`, which opens whatever the web client decides —
    the app switcher, or the user's Home Action. Neither is what a tenant should
    see at `https://<slug>.strataflow.co/`.

    Done as a redirect on `/` rather than by setting each user's Home Action,
    which was the other way to do it: the Home Action also hijacks `/odoo`, and
    `/odoo` is the only route back to the stock backend — the shell's avatar
    button ("Open Odoo", `core/shell.js` `openOdoo`) goes there, and Odoo 19 has
    no separate URL for the app switcher to send it to instead. Overriding `/`
    leaves that escape hatch working.

    Anyone who is not a Strataflow user — a portal user, or an internal user in a
    database where this module is installed but they are not on the locate desk —
    falls through to Odoo's own behaviour.
    """

    @http.route()
    def index(self, *args, **kw):
        if request.db and request.session.uid and is_user_internal(request.session.uid):
            user = request.env['res.users'].sudo().browse(request.session.uid)
            if user.has_group('strataflow_workorder.group_strataflow_user'):
                return request.redirect_query('/odoo/home', query=request.params)
        return super().index(*args, **kw)
