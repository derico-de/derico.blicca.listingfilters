"""FilteredListingBlockView browser view.

A custom browser view
"""
from Products.Five.browser import BrowserView


class FilteredListingBlockView(BrowserView):
    """A custom browser view"""

    def __call__(self):
        return '<li class="heading">FilteredListingBlockView</li>'
