"""Tests for upgrade step 1000 -> 1001."""

import pytest
from plone.app.testing import setRoles
from plone.app.testing import TEST_USER_ID
from plone.registry.interfaces import IRegistry
from Products.GenericSetup.upgrade import UpgradeDepends
from zope.component import getUtility

from derico.blicca.listingfilters.tests.test_setup import RECORD


PROFILE = "derico.blicca.listingfilters:default"


class TestUpgrade1001:
    @pytest.fixture(autouse=True)
    def _setup(self, integration):
        self.portal = integration["portal"]
        setRoles(self.portal, TEST_USER_ID, ["Manager"])
        self.registry = getUtility(IRegistry)

    def test_a_site_at_1000_gets_the_record(self):
        for name in [name for name in self.registry.records if name.startswith(RECORD)]:
            del self.registry.records[name]
        setup = self.portal.portal_setup
        setup.setLastVersionForProfile(PROFILE, "1000")
        setup.upgradeProfile(PROFILE)
        assert self.registry[f"{RECORD}.overrides"] == ["listing"]
        assert setup.getLastVersionForProfile(PROFILE) == ("1001",)

    def test_the_step_imports_only_the_registry(self):
        setup = self.portal.portal_setup
        setup.setLastVersionForProfile(PROFILE, "1000")
        (step,) = [
            step
            for group in setup.listUpgrades(PROFILE)
            for step in (group if isinstance(group, list) else [group])
            if step["sdest"] == "1001"
        ]
        assert isinstance(step["step"], UpgradeDepends)
        assert step["step"].import_steps == ["plone.app.registry"]
