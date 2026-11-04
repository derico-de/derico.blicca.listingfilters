"""Tests for upgrade step 1000 -> 1001."""

import pytest
from plone.app.testing import setRoles
from plone.app.testing import TEST_USER_ID
from plone.registry.interfaces import IRegistry
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
        for name in [name for name in self.registry.records.keys() if name.startswith(RECORD)]:
            del self.registry.records[name]
        setup = self.portal.portal_setup
        setup.setLastVersionForProfile(PROFILE, "1000")
        setup.upgradeProfile(PROFILE)
        assert self.registry[f"{RECORD}.overrides"] == ["listing"]
        assert setup.getLastVersionForProfile(PROFILE) == ("1001",)
