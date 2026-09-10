from werkzeug import urls

from odoo import http
from odoo.http import request
from odoo.addons.web.controllers.home import Home
from odoo.addons.web.controllers.utils import is_user_internal

# Where a Strataflow user lands when they have not asked for anywhere in particular.
# The screens live at /app/<path> (`path` on each client action, views/strataflow_actions.xml).
# Stock serves the web client at /odoo/<path>; /app is the same client under a prefix that
# does not name the vendor — `web_client` below answers both, and the client's router is
# taught the prefix in static/src/core/app_url.js. In production nginx (deploy/nginx) turns
# every /odoo URL the server still emits into /app before a browser sees it. Serving the
# screens at the domain root was tried on 2026-09-08 and reverted (the router's internal-link
# guard); a prefix the router is patched to know is the version that holds.
#
# The Home screen's path is `desk`, not `home`: stock Odoo registers a client action with the
# *tag* `home` (web/static/src/webclient/actions/client_actions.js) that navigates to "/", and
# the web client resolves a URL's action by registry tag before it tries action paths. So
# /odoo/home ran stock's action, which went to "/", which came back here: a reload loop.
HOME_URL = '/app/desk'


class StrataflowHome(Home):
    """Land Strataflow users on the Home screen, at the bare domain and after sign-in.

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

    def _is_strataflow_user(self, uid):
        if not uid or not request.db or not is_user_internal(uid):
            return False
        user = request.env['res.users'].sudo().browse(uid)
        return user.has_group('strataflow_workorder.group_strataflow_user')

    # Stock's route list plus /app: the web client answers the vendor-free prefix as its own.
    # The list is repeated rather than extended because `@http.route()` with no arguments
    # keeps the parent's rules and offers no way to add to them.
    @http.route(['/web', '/odoo', '/odoo/<path:subpath>', '/scoped_app/<path:subpath>',
                 '/app', '/app/<path:subpath>'],
                type='http', auth='none', readonly=Home._web_client_readonly)
    def web_client(self, s_action=None, **kw):
        return super().web_client(s_action=s_action, **kw)

    @http.route()
    def index(self, *args, **kw):
        # Signed out too, not just signed in. Stock sends an anonymous visitor to /odoo, which
        # bounces to /web/login?redirect=/odoo — and that redirect is then honoured after they
        # sign in, landing them in the stock backend on whatever the first app happens to be.
        # Sending them to the Home screen instead means the login carries it through as the
        # redirect. A non-internal user who ends up there is handled by `web_client` as before.
        if self._is_strataflow_user(request.session.uid) or not request.session.uid:
            return request.redirect_query(HOME_URL, query=request.params)
        return super().index(*args, **kw)

    def _login_redirect(self, uid, redirect=None):
        """Send a Strataflow user to their Home screen after signing in.

        Stock sends internal users to `/odoo` with no action, and the web client then
        opens the first app in the menu — which in this database is Discuss. Signing in
        to a locate desk should land on the locate desk.

        Only when there is nothing better to honour. An explicit `redirect` is normally
        whatever the user was actually trying to reach — `/web/login?redirect=/odoo/dispatch`
        is how a signed-out visit to a screen comes back — and that is left alone. But
        `/app`, `/odoo` and `/web` arrive here as explicit redirects while meaning nothing more
        than "the backend": stock's own `/` sends anonymous visitors to `/odoo`, which
        bounces to `/web/login?redirect=/odoo?`. Honouring that is what put people in
        Discuss. They are treated as no destination.

        A session without `uid` is a partial MFA session whose redirect is the
        second-factor URL rather than a destination, and is left to stock.
        """
        if request.session.uid and self._is_strataflow_user(uid) and self._is_placeholder(redirect):
            return HOME_URL
        return super()._login_redirect(uid, redirect=redirect)

    @staticmethod
    def _is_placeholder(redirect):
        """True when `redirect` carries no real destination — empty, or stock's backend entry."""
        if not redirect:
            return True
        path = urls.url_parse(redirect).path.rstrip('/')
        return path in ('', '/app', '/odoo', '/web')
