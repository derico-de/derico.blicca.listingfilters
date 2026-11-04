"""Testing setup for derico.blicca.listingfilters."""

import os

import plone.app.theming
import plone.blicca.auroraeditor
import plone.restapi
import plone.volto
from plone.app.contenttypes.testing import PLONE_APP_CONTENTTYPES_FIXTURE
from plone.app.testing import FunctionalTesting
from plone.app.testing import IntegrationTesting
from plone.app.testing import PloneSandboxLayer
from plone.app.testing import SITE_OWNER_NAME
from plone.app.testing import SITE_OWNER_PASSWORD
from plone.testing.zope import WSGI_SERVER_FIXTURE

import derico.blicca.listingfilters


class DericoBliccaListingfiltersLayer(PloneSandboxLayer):
    """Custom testing layer for derico.blicca.listingfilters."""

    defaultBases = (PLONE_APP_CONTENTTYPES_FIXTURE,)

    def setUpZope(self, app, configurationContext):
        """Set up Zope."""
        # Compile .po -> .mo so add-on translations load during tests.
        os.environ.setdefault("zope_i18n_compile_mo_files", "true")
        self.loadZCML(package=plone.app.theming)
        self.loadZCML(package=plone.restapi)
        # Its ZCML only, as on a Blicca site: the summary serializer's metadata
        # utility, without the site policy of its profile.
        self.loadZCML(package=plone.volto)
        self.loadZCML(package=plone.blicca.auroraeditor)
        self.loadZCML(package=derico.blicca.listingfilters)

    def setUpPloneSite(self, portal):
        """Set up Plone site."""
        self.applyProfile(portal, "plone.blicca.auroraeditor:default")
        self.applyProfile(portal, "derico.blicca.listingfilters:default")
        # The sandbox site has no workflow chain; base results differ per visitor.
        portal.portal_workflow.setDefaultChain("simple_publication_workflow")


FIXTURE = DericoBliccaListingfiltersLayer()

INTEGRATION_TESTING = IntegrationTesting(
    bases=(FIXTURE,),
    name="DericoBliccaListingfiltersLayer:IntegrationTesting",
)

FUNCTIONAL_TESTING = FunctionalTesting(
    bases=(FIXTURE,),
    name="DericoBliccaListingfiltersLayer:FunctionalTesting",
)

ACCEPTANCE_TESTING = FunctionalTesting(
    bases=(FIXTURE, WSGI_SERVER_FIXTURE),
    name="DericoBliccaListingfiltersLayer:AcceptanceTesting",
)


# Test credentials
TEST_USER_ID = "testuser"
TEST_USER_NAME = "testuser"
SITE_OWNER_NAME = SITE_OWNER_NAME
SITE_OWNER_PASSWORD = SITE_OWNER_PASSWORD
