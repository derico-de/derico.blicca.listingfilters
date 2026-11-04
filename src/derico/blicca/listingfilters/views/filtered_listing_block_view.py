"""The core listing block, with filters a visitor narrows it by."""

import json
from collections import namedtuple
from functools import cached_property
from time import time
from urllib.parse import parse_qsl
from urllib.parse import urlencode

import Missing
from AccessControl import getSecurityManager
from plone import api
from plone.base.utils import munge_search_term
from plone.blicca.auroraeditor.rendering import listing_brains
from plone.blicca.auroraeditor.rendering import ListingBlockView
from plone.blicca.auroraeditor.rendering import result_cap
from plone.blicca.auroraeditor.rendering import summarize_brains
from plone.memoize import ram
from plone.registry.interfaces import IRegistry
from Products.CMFCore.utils import getToolByName
from Products.Five.browser.pagetemplatefile import ViewPageTemplateFile
from Products.ZCTextIndex.ParseTree import ParseError
from zope.component import getUtility
from zope.component import queryUtility
from zope.i18n import translate
from zope.schema.interfaces import IVocabularyFactory

from derico.blicca.listingfilters.filtering import narrow
from derico.blicca.listingfilters.filtering import ordered_options
from derico.blicca.listingfilters.i18n import _


TEXT_FIELD = "SearchableText"
# Effective ranges and relative dates move on without the catalog changing.
RECHECK_SECONDS = 300

Narrowed = namedtuple("Narrowed", "results options selected")


def _as_values(value):
    if value is None or value is Missing.Value:
        return set()
    if isinstance(value, list | tuple | set):
        return {str(item) for item in value if item is not None and item is not Missing.Value}
    return {str(value)}


def _text_matches(catalog, brains, term):
    if not brains:
        return set()
    try:
        return {
            brain.getRID()
            for brain in catalog(SearchableText=term, UID=[brain.UID for brain in brains])
        }
    except ParseError:
        return set()


def _limit(querystring):
    try:
        return max(int(querystring.get("limit") or 0), 0)
    except (TypeError, ValueError):
        return 0


def _cache_key(_fun, context, _request, querystring, allow_lists, chosen, term):
    catalog = getToolByName(context, "portal_catalog")
    return (
        "/".join(context.getPhysicalPath()),
        json.dumps([querystring, allow_lists, chosen, term], sort_keys=True, default=str),
        tuple(sorted(catalog._listAllowedRolesAndUsers(getSecurityManager().getUser()))),
        api.portal.get_current_language(context=context),
        catalog.getCounter(),
        int(time() / RECHECK_SECONDS),
    )


def _field_record(field, name):
    return getUtility(IRegistry).get(f"plone.app.querystring.field.{field}.{name}")


def _vocabulary(context, field):
    name = _field_record(field, "vocabulary")
    factory = queryUtility(IVocabularyFactory, name) if name else None
    return factory(context) if factory is not None else None


def _value_title(vocabulary, value, request):
    if vocabulary is None:
        return value
    try:
        title = vocabulary.getTerm(value).title
    except LookupError:
        return value
    return translate(title, context=request) if title else value


def _titled(context, request, field, values):
    if not values:
        return {}
    vocabulary = _vocabulary(context, field)
    return {value: _value_title(vocabulary, value, request) for value in values}


@ram.cache(_cache_key)
def _narrowed(context, request, querystring, allow_lists, chosen, term):
    """One query serves results and options, which map each value to its title."""
    limit = _limit(querystring)
    brains = listing_brains(context, request, {"querystring": querystring}, limit=limit)
    if limit:
        brains = brains[:limit]
    entries = [
        (brain.getRID(), {field: _as_values(getattr(brain, field, None)) for field in allow_lists})
        for brain in brains
    ]
    catalog = getToolByName(context, "portal_catalog")
    text_matches = _text_matches(catalog, brains, term) if term else None
    results, options, selected = narrow(entries, allow_lists, chosen, text_matches)
    titled = {field: _titled(context, request, field, options[field]) for field in options}
    return Narrowed(tuple(results), titled, selected)


class FilteredListingBlockView(ListingBlockView):
    """A listing with no ``filters`` renders as the core block does."""

    filters_template = ViewPageTemplateFile("templates/listing_filters.pt")
    pager_template = ViewPageTemplateFile("templates/listing_pager.pt")

    @cached_property
    def filters(self):
        raw = (self.data or {}).get("filters")
        columns = getToolByName(self.context, "portal_catalog").schema()
        filters = {}
        for entry in raw if isinstance(raw, list) else ():
            field = entry.get("field") if isinstance(entry, dict) else None
            if field in filters or not (field == TEXT_FIELD or field in columns):
                continue
            allow_list = entry.get("allowList")
            filters[field] = {
                "field": field,
                "title": entry.get("title") or "",
                "allow_list": allow_list if isinstance(allow_list, list) else [],
            }
        return filters

    @cached_property
    def querystring(self):
        return (self.data or {}).get("querystring") or {}

    @cached_property
    def allow_lists(self):
        return {
            field: entry["allow_list"]
            for field, entry in self.filters.items()
            if field != TEXT_FIELD
        }

    def _param(self, name):
        return f"{self.block_id}.{name}"

    def _sent(self, name):
        return self.request.form.get(self._param(name)) if self.block_id else None

    @cached_property
    def chosen(self):
        chosen = {}
        for field in self.allow_lists:
            value = self._sent(field)
            values = [value] if isinstance(value, str) else value
            if isinstance(values, list):
                chosen[field] = sorted(v for v in values if isinstance(v, str))
        return chosen

    @cached_property
    def term(self):
        value = self._sent(TEXT_FIELD) if TEXT_FIELD in self.filters else None
        return value.strip() if isinstance(value, str) else ""

    @cached_property
    def narrowed(self):
        return _narrowed(
            self.context,
            self.request,
            self.querystring,
            self.allow_lists,
            self.chosen,
            munge_search_term(self.term),
        )

    @cached_property
    def page_size(self):
        return result_cap(self.querystring)

    @cached_property
    def start(self):
        try:
            sent = max(int(self._sent("b_start")), 0)
        except (TypeError, ValueError):
            sent = 0
        last = (len(self.narrowed.results) - 1) // self.page_size * self.page_size
        return min(sent, max(last, 0))

    def summaries(self):
        if not self.filters:
            return super().summaries()
        catalog = getToolByName(self.context, "portal_catalog")._catalog
        page = self.narrowed.results[self.start : self.start + self.page_size]
        return summarize_brains(self.request, [catalog[rid] for rid in page])

    @cached_property
    def _base_url(self):
        return self.request.get("ACTUAL_URL") or self.context.absolute_url()

    @cached_property
    def _foreign_params(self):
        own = f"{self.block_id}."
        query = self.request.get("QUERY_STRING") or ""
        return [
            pair for pair in parse_qsl(query, keep_blank_values=True) if not pair[0].startswith(own)
        ]

    def _selection_params(self, selected):
        return [
            (self._param(field), value)
            for field in self.allow_lists
            for value in sorted(selected.get(field, ()))
        ]

    def _href(self, selected, term="", start=0):
        if not self.block_id:
            return "#"
        params = self._foreign_params + self._selection_params(selected)
        if term:
            params.append((self._param(TEXT_FIELD), term))
        if start:
            params.append((self._param("b_start"), start))
        query = f"?{urlencode(params)}" if params else ""
        return f"{self._base_url}{query}#{self.anchor}"

    @property
    def anchor(self):
        return f"listing-{self.block_id}" if self.block_id else None

    def _title_of(self, field):
        title = _field_record(field, "title") or field
        return translate(title, domain="plone", context=self.request)

    def _option(self, field, value, title):
        picked = self.narrowed.selected[field]
        toggled = picked ^ {value}
        return {
            "title": title,
            "selected": value in picked,
            "href": self._href({**self.narrowed.selected, field: toggled}, self.term),
        }

    def _options_group(self, entry):
        field = entry["field"]
        titles = self.narrowed.options[field]
        values = ordered_options(titles, entry["allow_list"])
        return {
            "kind": "options",
            "field": field,
            "title": entry["title"] or self._title_of(field),
            "options": [self._option(field, value, titles[value]) for value in values],
        }

    def _search_group(self, entry):
        return {
            "kind": "search",
            "title": entry["title"] or translate(_("Search"), context=self.request),
            "name": self._param(TEXT_FIELD),
            "value": self.term,
            "disabled": "disabled" if not self.block_id else None,
            "action": f"{self._base_url}#{self.anchor}" if self.block_id else "#",
            "hidden": (
                self._foreign_params + self._selection_params(self.narrowed.selected)
                if self.block_id
                else []
            ),
        }

    @property
    def groups(self):
        groups = []
        for field, entry in self.filters.items():
            if field == TEXT_FIELD:
                groups.append(self._search_group(entry))
            elif self.narrowed.options[field]:
                groups.append(self._options_group(entry))
        return groups

    @property
    def reset_url(self):
        if not self.block_id or not (self.term or any(self.narrowed.selected.values())):
            return None
        return self._href({})

    @property
    def above_items(self):
        return self.filters_template() if self.filters else ""

    @property
    def pager(self):
        if len(self.narrowed.results) <= self.page_size:
            return None
        previous_start = self.start - self.page_size
        next_start = self.start + self.page_size
        return {
            "page": self.start // self.page_size + 1,
            "pages": (len(self.narrowed.results) - 1) // self.page_size + 1,
            "previous": (
                self._href(self.narrowed.selected, self.term, max(previous_start, 0))
                if self.start > 0
                else None
            ),
            "next": (
                self._href(self.narrowed.selected, self.term, next_start)
                if next_start < len(self.narrowed.results)
                else None
            ),
        }

    @property
    def below_items(self):
        return self.pager_template() if self.filters and self.pager else ""
