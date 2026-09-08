from . import controllers
from . import models


def post_init_hook(env):
    """Rename Odoo's third pipeline stage to the design's wording.

    The design reads New / Qualified / Quote sent / Won; Odoo ships
    "Proposition" in that slot. Done here rather than as a data record because
    our data file is noupdate — an XML override would apply on a fresh install
    and silently do nothing on an update. Only the untouched Odoo default is
    renamed, so a tenant who picked their own wording keeps it.
    """
    stage = env.ref("crm.stage_lead3", raise_if_not_found=False)
    if stage and stage.name == "Proposition":
        stage.name = "Quote sent"
