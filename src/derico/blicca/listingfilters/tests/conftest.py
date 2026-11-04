"""Pytest configuration for derico.blicca.listingfilters tests."""

from pytest_plone import fixtures_factory

from derico.blicca.listingfilters.testing import FUNCTIONAL_TESTING
from derico.blicca.listingfilters.testing import INTEGRATION_TESTING


globals().update(
    fixtures_factory((
        (INTEGRATION_TESTING, "integration"),
        (FUNCTIONAL_TESTING, "functional"),
    ))
)
