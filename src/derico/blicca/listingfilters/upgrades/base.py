"""Shared upgrade step utilities for derico.blicca.listingfilters."""
from plone.app.upgrade.utils import loadMigrationProfile


def reload_gs_profile(context):
    """Reload the default GenericSetup profile."""
    loadMigrationProfile(context, "profile-derico.blicca.listingfilters:default")
