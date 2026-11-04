"""Test derico.blicca.listingfilters installation."""

import pytest
from plone.app.testing import setRoles
from plone.app.testing import TEST_USER_ID
from plone.base.interfaces import INonInstallable
from plone.browserlayer.utils import registered_layers
from plone.registry.interfaces import IRegistry
from zope.component import getUtility
from zope.component import getUtilitiesFor
from zope.interface import alsoProvides

from derico.blicca.listingfilters.interfaces import IDericoBliccaListingfiltersLayer
from plone import api
from plone.blicca.auroraeditor import blockaddons


RECORD = "plone.blicca.auroraeditor.blockaddons/derico.blicca.listingfilters.listing"


class TestSetup:
    @pytest.fixture(autouse=True)
    def _setup(self, integration):
        self.portal = integration["portal"]
        self.request = integration["request"]

    def test_addon_installed(self):
        installer = api.addon.get_installer(self.portal)
        assert installer.is_product_installed("derico.blicca.listingfilters")

    def test_browserlayer(self):
        assert IDericoBliccaListingfiltersLayer in registered_layers()

    def test_only_the_default_profile_is_offered(self):
        hidden = set()
        for _name, utility in getUtilitiesFor(INonInstallable):
            hidden.update(utility.getNonInstallableProfiles())
        assert {
            "derico.blicca.listingfilters:uninstall",
            "derico.blicca.listingfilters.upgrades:1001",
        } <= hidden

    def test_the_record_declares_the_override(self):
        registry = getUtility(IRegistry)
        assert registry[f"{RECORD}.types"] == ["listing"]
        assert registry[f"{RECORD}.overrides"] == ["listing"]

    def test_it_takes_the_listing_over(self):
        statuses = blockaddons.evaluate(self.portal)
        (status,) = [s for s in statuses if s.name.startswith("derico.blicca.listingfilters")]
        assert status.loadable, status
        assert status.overridden == {"listing": "core"}

    def test_the_renderer_lines_up_with_the_declaration(self):
        statuses = blockaddons.evaluate(self.portal)
        alsoProvides(self.request, IDericoBliccaListingfiltersLayer)
        assert blockaddons.renderer_conflicts(self.portal, self.request, statuses) == []
        assert blockaddons.lockstep_gaps(self.portal, self.request, statuses) == []


class TestUninstall:
    @pytest.fixture(autouse=True)
    def _setup(self, integration):
        self.portal = integration["portal"]
        setRoles(self.portal, TEST_USER_ID, ["Manager"])
        self.installer = api.addon.get_installer(self.portal)
        self.installer.uninstall_product("derico.blicca.listingfilters")

    def test_addon_uninstalled(self):
        assert not self.installer.is_product_installed("derico.blicca.listingfilters")

    def test_browserlayer_removed(self):
        assert IDericoBliccaListingfiltersLayer not in registered_layers()

    def test_record_removed(self):
        registry = getUtility(IRegistry)
        assert not [name for name in registry.records.keys() if name.startswith(RECORD)]
