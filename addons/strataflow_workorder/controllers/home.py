from werkzeug import urls

from odoo import http
from odoo.http import request
from odoo.addons.web.controllers.home import Home
from odoo.addons.web.controllers.utils import is_user_internal

# The six product screens, by the `path` on their client action (views/strataflow_actions.xml).
# Each is served at the bare root as well as at Odoo's own /odoo/<path>; the client-side half
# of this lives in static/src/core/router_paths.js.
SCREEN_PATHS = ['home', 'dispatch', 'workorders', 'pipeline', 'invoices', 'locator']


class StrataflowHome(Home):
    """Serve the product screens at the root of the domain, with no /odoo in the URL.

    A tenant at https://<slug>.strataflow.co should see /dispatch, not
    /odoo/action-strataflow_workorder.action_strataflow_dispatch, and not
    /odoo/dispatch either.

    Two halves. Here, each screen gets a real route at the root that serves the
    web client exactly as /odoo does — so the URL can be typed, bookmarked,
    linked and reloaded. In `static/src/core/router_paths.js`, the web client's
    router is taught the same mapping, so that once it has booted it keeps
    writing /dispatch into the address bar instead of rewriting it back to
    /odoo/dispatch on the first navigation. The router documents both
    conversions as patchable ("state <-> url conversions can be patched if
    needed in a custom webclient"), so this is an extension point rather than a
    hack, but the two halves have to agree: adding a screen means adding its
    path in both places.

    /odoo/<path> keeps working, and so does /odoo itself — that is still the way
    into the stock backend, which the shell's avatar button relies on.
    """

    def _is_strataflow_user(self, uid):
        if not uid or not request.db or not is_user_internal(uid):
            return False
        user = request.env['res.users'].sudo().browse(uid)
        return user.has_group('strataflow_workorder.group_strataflow_user')

    @http.route()
    def index(self, *args, **kw):
        # Signed out too, not just signed in. Stock sends an anonymous visitor to /odoo, which
        # bounces to /web/login?redirect=/odoo — and that redirect is then honoured after they
        # sign in, landing them in the stock backend on whatever the first app happens to be.
        # Sending them to /home instead means the login carries /home through as the redirect.
        # A non-internal user who ends up there is handled by `web_client` exactly as before.
        if self._is_strataflow_user(request.session.uid) or not request.session.uid:
            return request.redirect_query('/home', query=request.params)
        return super().index(*args, **kw)

    def _login_redirect(self, uid, redirect=None):
        """Send a Strataflow user to their Home screen after signing in.

        Stock sends internal users to `/odoo` with no action, and the web client then
        opens the first app in the menu — which in this database is Discuss. Signing in
        to a locate desk should land on the locate desk.

        Only when there is nothing better to honour. An explicit `redirect` is normally
        whatever the user was actually trying to reach — `/web/login?redirect=/dispatch`
        is how a signed-out visit to a screen comes back — and that is left alone. But
        `/odoo` and `/web` arrive here as explicit redirects while meaning nothing more
        than "the backend": stock's own `/` sends anonymous visitors to `/odoo`, which
        bounces to `/web/login?redirect=/odoo?`. Honouring that is what put people in
        Discuss. They are treated as no destination.

        A session without `uid` is a partial MFA session whose redirect is the
        second-factor URL rather than a destination, and is left to stock.
        """
        if request.session.uid and self._is_strataflow_user(uid) and self._is_placeholder(redirect):
            return '/home'
        return super()._login_redirect(uid, redirect=redirect)

    @staticmethod
    def _is_placeholder(redirect):
        """True when `redirect` carries no real destination — empty, or stock's backend entry."""
        if not redirect:
            return True
        path = urls.url_parse(redirect).path.rstrip('/')
        return path in ('', '/odoo', '/web')

    @http.route(['/' + p for p in SCREEN_PATHS], type='http', auth='none')
    def strataflow_screen(self, **kw):
        """Serve the web client for a screen addressed at the root.

        Delegating to `web_client` rather than reimplementing it keeps the whole
        boot sequence — ensure_db, the session check, the login redirect that
        carries this path through as `redirect` — identical to /odoo's.
        """
        return self.web_client(**kw)
