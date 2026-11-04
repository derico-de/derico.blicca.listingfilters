"""Setup handlers for derico.blicca.listingfilters."""
from plone.base.interfaces import INonInstallable
from zope.interface import implementer


@implementer(INonInstallable)
class HiddenProfiles:
    """Hidden profiles from the Plone add-ons control panel."""

    def getNonInstallableProfiles(self):
        """Return list of profiles that should not be available for install."""
        return [
            "derico.blicca.listingfilters:uninstall",
            "derico.blicca.listingfilters.upgrades:1001",
        ]


def uninstall(context):
    """Uninstall script."""
    # Do something on uninstall if needed
    pass
