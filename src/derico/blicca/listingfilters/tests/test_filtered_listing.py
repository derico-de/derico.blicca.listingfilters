"""A listing a visitor narrows, rendered by the ``aurora-block-listing`` override."""

import re
from unittest import mock

import lxml.html
import pytest
from plone import api
from plone.app.testing import login
from plone.app.testing import logout
from plone.app.testing import setRoles
from plone.app.testing import TEST_USER_ID
from plone.app.testing import TEST_USER_NAME
from plone.blicca.auroraeditor.interfaces import IPloneBliccaAuroraeditorLayer
from plone.memoize import ram
from plone.restapi.behaviors import IBlocks
from zope.component import getMultiAdapter
from zope.component import getSiteManager
from zope.component import getUtility
from zope.interface import alsoProvides
from zope.schema.interfaces import IVocabularyFactory

from derico.blicca.listingfilters.interfaces import IDericoBliccaListingfiltersLayer
from derico.blicca.listingfilters.views import filtered_listing_block_view
from derico.blicca.listingfilters.views.filtered_listing_block_view import FilteredListingBlockView


BLOCK_ID = "block-1"
IN_BASE = {
    "i": "path",
    "o": "plone.app.querystring.operation.string.absolutePath",
    "v": "/plone/base::1",
}
SUBJECT_FILTER = {"field": "Subject"}
TEXT_FILTER = {"field": "SearchableText"}


def listing(*filters, query=None, **querystring):
    return {
        "@type": "listing",
        "filters": list(filters),
        "querystring": {
            "query": query or [IN_BASE],
            "sort_on": "sortable_title",
            **querystring,
        },
    }


class ListingCase:
    @pytest.fixture(autouse=True)
    def _setup(self, integration):
        self.portal = integration["portal"]
        self.request = integration["request"]
        alsoProvides(self.request, IDericoBliccaListingfiltersLayer)
        setRoles(self.portal, TEST_USER_ID, ["Manager"])
        login(self.portal, TEST_USER_NAME)
        ram.global_cache.invalidateAll()
        base = api.content.create(container=self.portal, type="Folder", id="base")
        self.base = base
        self._page(base, "Cooking page", ["cooking"], description="Kartoffelsuppe", kind="Document")
        self._page(base, "Plone news", ["plone", "python"], kind="News Item")
        self._page(base, "Plone talk", ["plone"], kind="Event")
        secret = api.content.create(
            container=base, type="Document", title="Secret page", subject=["secret"]
        )
        self.secret = secret
        self._page(self.portal, "Outside page", ["plone", "gardening"], kind="Document")
        self.request.set("ACTUAL_URL", "http://nohost/plone/page")
        self.request.set("QUERY_STRING", "")

    def _page(self, container, title, subject, kind, description=""):
        page = api.content.create(
            container=container, type=kind, title=title, subject=subject, description=description
        )
        api.content.transition(page, "publish")
        return page

    def pick(self, **values):
        for field, value in values.items():
            self.request.form[f"{BLOCK_ID}.{field}"] = value

    def render(self, data, block_id=BLOCK_ID):
        view = getMultiAdapter((self.portal, self.request), name="aurora-block-listing")
        view.data = data
        view.block_id = block_id
        return lxml.html.fromstring(view())

    def titles(self, block):
        return [a.text_content() for a in block.xpath('.//div[@class="listing-items"]//article//a')]

    def options(self, block, field):
        return [
            a.text_content().strip()
            for a in block.xpath(f'.//ul[@data-listing-filter="{field}"]//a')
        ]

    def selected(self, block, field):
        return [
            a.text_content().strip()
            for a in block.xpath(f'.//ul[@data-listing-filter="{field}"]//a[@aria-current="true"]')
        ]

    def href(self, block, field, title):
        (link,) = [
            a
            for a in block.xpath(f'.//ul[@data-listing-filter="{field}"]//a')
            if a.text_content().strip() == title
        ]
        return link.get("href")


class TestOverride(ListingCase):
    def test_it_replaces_the_core_listing_on_our_layer(self):
        view = getMultiAdapter((self.portal, self.request), name="aurora-block-listing")
        assert isinstance(view, FilteredListingBlockView)
        assert IDericoBliccaListingfiltersLayer.extends(IPloneBliccaAuroraeditorLayer)


class TestNoFilters(ListingCase):
    def test_a_listing_without_filters_prints_no_filter_markup(self):
        block = self.render({"@type": "listing", "querystring": {"query": [IN_BASE]}})
        assert not block.xpath('.//*[contains(@class, "listing-filters")]')
        assert not block.xpath('.//*[contains(@class, "listing-pager")]')

    def test_a_listing_without_filters_reuses_the_resolved_items(self):
        block = self.render({
            "@type": "listing",
            "querystring": {"query": [IN_BASE]},
            "items": [{"@id": "http://x/a", "@type": "Document", "title": "Resolved"}],
        })
        assert self.titles(block) == ["Resolved"]

    def test_a_listing_without_filters_ignores_the_visitors_selection(self):
        self.pick(Subject="cooking")
        block = self.render(listing())
        assert "Plone news" in self.titles(block)

    def test_unusable_filters_count_as_none(self):
        block = self.render(listing({"field": "no_such_column"}, "junk", {"title": "x"}))
        assert not block.xpath('.//*[contains(@class, "listing-filters")]')


class TestBaseResults(ListingCase):
    def test_options_come_from_this_listing_not_the_whole_site(self):
        block = self.render(listing(SUBJECT_FILTER))
        assert self.options(block, "Subject") == ["cooking", "plone", "python", "secret"]

    def test_a_selection_narrows_the_results(self):
        self.pick(Subject="python")
        block = self.render(listing(SUBJECT_FILTER))
        assert self.titles(block) == ["Plone news"]
        assert self.selected(block, "Subject") == ["python"]

    def test_the_resolved_items_are_not_used(self):
        data = listing(SUBJECT_FILTER)
        data["items"] = [{"@id": "http://x/a", "@type": "Document", "title": "Resolved"}]
        assert "Resolved" not in self.titles(self.render(data))

    def test_a_value_only_outside_the_base_results_is_ignored(self):
        self.pick(Subject="gardening")
        block = self.render(listing(SUBJECT_FILTER))
        assert "Outside page" not in self.titles(block)
        assert "Plone news" in self.titles(block)
        assert self.selected(block, "Subject") == []

    def test_a_filter_on_an_index_the_query_uses_still_narrows(self):
        by_subject = {
            "i": "Subject",
            "o": "plone.app.querystring.operation.selection.any",
            "v": ["cooking"],
        }
        self.pick(Subject="plone")
        block = self.render(listing(SUBJECT_FILTER, query=[by_subject]))
        assert self.titles(block) == ["Cooking page"]
        assert self.selected(block, "Subject") == []

    def test_only_a_string_or_strings_count_as_a_selection(self):
        self.pick(Subject={"record": "python"})
        assert "Cooking page" in self.titles(self.render(listing(SUBJECT_FILTER)))

    def test_several_values_widen(self):
        self.pick(Subject=["python", "cooking"])
        block = self.render(listing(SUBJECT_FILTER))
        assert self.titles(block) == ["Cooking page", "Plone news"]

    def test_the_querystring_limit_bounds_the_base_results(self):
        block = self.render(listing(SUBJECT_FILTER, limit=1))
        assert self.titles(block) == ["Cooking page"]
        assert self.options(block, "Subject") == ["cooking"]


class TestVisibility(ListingCase):
    def test_a_visitor_never_sees_what_they_may_not_see(self):
        self.render(listing(SUBJECT_FILTER))
        logout()
        block = self.render(listing(SUBJECT_FILTER))
        assert self.options(block, "Subject") == ["cooking", "plone", "python"]
        assert "Secret page" not in self.titles(block)


class TestOptions(ListingCase):
    def test_an_allow_list_limits_and_orders(self):
        block = self.render(listing({"field": "Subject", "allowList": ["python", "cooking", "x"]}))
        assert self.options(block, "Subject") == ["python", "cooking"]

    def test_a_selection_outside_the_allow_list_is_ignored(self):
        self.pick(Subject="plone")
        block = self.render(listing({"field": "Subject", "allowList": ["python", "cooking"]}))
        assert self.selected(block, "Subject") == []
        assert "Plone talk" in self.titles(block)

    def test_other_filters_limit_the_options(self):
        self.pick(Subject="cooking")
        block = self.render(listing(SUBJECT_FILTER, {"field": "portal_type"}))
        assert self.options(block, "portal_type") == ["Page"]

    def test_values_show_their_vocabulary_title(self):
        block = self.render(listing({"field": "portal_type"}))
        assert "News Item" in self.options(block, "portal_type")
        assert "Page" in self.options(block, "portal_type")

    def test_a_repeated_listing_does_not_build_the_vocabulary_again(self):
        name = "plone.app.vocabularies.ReallyUserFriendlyTypes"
        factory = mock.Mock(wraps=getUtility(IVocabularyFactory, name))
        site_manager = getSiteManager(self.portal)
        site_manager.registerUtility(factory, IVocabularyFactory, name=name)
        try:
            with mock.patch.object(filtered_listing_block_view, "time", return_value=0):
                self.render(listing({"field": "portal_type"}))
                block = self.render(listing({"field": "portal_type"}))
        finally:
            site_manager.unregisterUtility(factory, IVocabularyFactory, name=name)
        assert "Page" in self.options(block, "portal_type")
        assert factory.call_count == 1

    def test_the_staff_title_names_the_filter(self):
        block = self.render(listing({"field": "Subject", "title": "Themen"}))
        assert block.xpath('.//*[@class="listing-filter-title"]')[0].text_content() == "Themen"

    def test_the_querystring_title_is_the_fallback(self):
        block = self.render(listing(SUBJECT_FILTER))
        assert block.xpath('.//*[@class="listing-filter-title"]')[0].text_content() == "Tag"

    def test_a_filter_with_nothing_to_offer_is_not_shown(self):
        self.pick(SearchableText="nothing-matches-this")
        block = self.render(listing(TEXT_FILTER, SUBJECT_FILTER))
        assert self.options(block, "Subject") == []
        assert not block.xpath('.//*[@class="listing-filter-title"]')


class TestTextSearch(ListingCase):
    def test_a_term_narrows_the_results_and_the_options(self):
        self.pick(SearchableText="Kartoffelsuppe")
        block = self.render(listing(TEXT_FILTER, SUBJECT_FILTER))
        assert self.titles(block) == ["Cooking page"]
        assert self.options(block, "Subject") == ["cooking"]

    def test_a_term_only_matching_outside_finds_nothing(self):
        self.pick(SearchableText="Outside")
        block = self.render(listing(TEXT_FILTER))
        assert self.titles(block) == []
        assert block.xpath('.//p[@class="listing-empty"]')

    def test_the_term_is_echoed_in_the_field(self):
        self.pick(SearchableText='"><script>alert(1)</script>')
        block = self.render(listing(TEXT_FILTER))
        (field,) = block.xpath('.//input[@type="search"]')
        assert field.get("value") == '"><script>alert(1)</script>'
        assert not block.xpath(".//script[not(@src)]")

    @pytest.mark.parametrize("term", ['"', "(x", "AND", "*"])
    def test_a_term_the_index_cannot_parse_breaks_nothing(self, term):
        self.pick(SearchableText=term)
        self.render(listing(TEXT_FILTER))

    def test_a_blank_term_is_no_filter(self):
        self.pick(SearchableText="   ")
        assert "Plone news" in self.titles(self.render(listing(TEXT_FILTER)))

    def test_the_form_keeps_the_rest_of_the_state(self):
        self.request.set("QUERY_STRING", "other=1")
        self.pick(Subject="plone", b_start="1", SearchableText="x")
        block = self.render(listing(TEXT_FILTER, SUBJECT_FILTER))
        (form,) = block.xpath('.//form[@role="search"]')
        hidden = {(i.get("name"), i.get("value")) for i in form.xpath('.//input[@type="hidden"]')}
        assert hidden == {("other", "1"), (f"{BLOCK_ID}.Subject", "plone")}
        assert form.get("action") == "http://nohost/plone/page#listing-block-1"


class TestLinks(ListingCase):
    def test_an_option_links_to_its_selection(self):
        block = self.render(listing(SUBJECT_FILTER))
        assert self.href(block, "Subject", "python") == (
            "http://nohost/plone/page?block-1.Subject=python#listing-block-1"
        )

    def test_a_selected_option_links_to_its_removal(self):
        self.pick(Subject=["python", "cooking"])
        block = self.render(listing(SUBJECT_FILTER))
        assert self.href(block, "Subject", "python") == (
            "http://nohost/plone/page?block-1.Subject=cooking#listing-block-1"
        )

    def test_another_blocks_state_survives(self):
        self.request.set("QUERY_STRING", "block-2.Subject=a&block-2.Subject=b&x=%C3%A4")
        block = self.render(listing(SUBJECT_FILTER))
        assert self.href(block, "Subject", "python") == (
            "http://nohost/plone/page?block-2.Subject=a&block-2.Subject=b&x=%C3%A4"
            "&block-1.Subject=python#listing-block-1"
        )

    def test_another_blocks_selection_is_not_read(self):
        self.request.form["block-2.Subject"] = "python"
        assert "Cooking page" in self.titles(self.render(listing(SUBJECT_FILTER)))

    def test_changing_a_filter_returns_to_the_first_page(self):
        self.pick(b_start="1")
        block = self.render(listing(SUBJECT_FILTER, b_size=1))
        assert "b_start" not in self.href(block, "Subject", "python")

    def test_reset_is_offered_only_with_a_selection(self):
        block = self.render(listing(SUBJECT_FILTER))
        assert not block.xpath('.//a[contains(@class, "listing-filters-reset")]')
        self.pick(Subject="python")
        block = self.render(listing(SUBJECT_FILTER))
        (reset,) = block.xpath('.//a[contains(@class, "listing-filters-reset")]')
        assert reset.get("href") == "http://nohost/plone/page#listing-block-1"

    def test_the_block_is_the_link_target(self):
        block = self.render(listing(SUBJECT_FILTER))
        assert block.xpath('.//*[@id="listing-block-1"]')


class TestPager(ListingCase):
    def pager(self, block):
        return block.xpath('.//nav[contains(@class, "listing-pager")]')

    def test_no_pager_when_everything_fits(self):
        assert not self.pager(self.render(listing(SUBJECT_FILTER)))

    def test_the_first_page_links_on(self):
        block = self.render(listing(SUBJECT_FILTER, b_size=2))
        assert self.titles(block) == ["Cooking page", "Plone news"]
        (pager,) = self.pager(block)
        assert "Page 1 of 2" in pager.text_content()
        (link,) = pager.xpath(".//a")
        assert link.get("href") == "http://nohost/plone/page?block-1.b_start=2#listing-block-1"

    def test_the_last_page_links_back(self):
        self.pick(b_start="2")
        block = self.render(listing(SUBJECT_FILTER, b_size=2))
        assert self.titles(block) == ["Plone talk", "Secret page"]
        (pager,) = self.pager(block)
        (link,) = pager.xpath(".//a")
        assert link.get("href") == "http://nohost/plone/page#listing-block-1"

    def test_the_pager_keeps_the_selection(self):
        self.pick(Subject="plone")
        block = self.render(listing(SUBJECT_FILTER, b_size=1))
        (link,) = self.pager(block)[0].xpath(".//a")
        assert link.get("href") == (
            "http://nohost/plone/page?block-1.Subject=plone&block-1.b_start=1#listing-block-1"
        )

    @pytest.mark.parametrize("b_start", ["-3", "junk", {"x": 1}])
    def test_a_crafted_start_is_the_first_page(self, b_start):
        self.pick(b_start=b_start)
        block = self.render(listing(SUBJECT_FILTER, b_size=2))
        assert self.titles(block) == ["Cooking page", "Plone news"]

    def test_a_start_past_the_end_is_the_last_page(self):
        self.pick(b_start="99")
        block = self.render(listing(SUBJECT_FILTER, b_size=3))
        assert self.titles(block) == ["Secret page"]


class TestBatchSize(ListingCase):
    def paged(self, *filters, size, **querystring):
        return self.render({**listing(*filters, **querystring), "batchSize": size})

    def pages(self, block):
        (pager,) = block.xpath('.//nav[contains(@class, "listing-pager")]/span')
        return pager.text_content()

    @pytest.mark.parametrize("size", [2, "2"])
    def test_it_sets_how_many_results_a_page_shows(self, size):
        block = self.paged(SUBJECT_FILTER, size=size)
        assert self.titles(block) == ["Cooking page", "Plone news"]
        assert self.pages(block) == "Page 1 of 2"

    def test_it_wins_over_the_batch_size_of_the_query(self):
        block = self.paged(SUBJECT_FILTER, size=3, b_size=1)
        assert self.titles(block) == ["Cooking page", "Plone news", "Plone talk"]

    @pytest.mark.parametrize("size", [None, "", 0])
    def test_without_one_the_query_decides(self, size):
        block = self.paged(SUBJECT_FILTER, size=size, b_size=1)
        assert self.titles(block) == ["Cooking page"]

    @pytest.mark.parametrize("size", ["junk", -1, {"x": 1}])
    def test_a_crafted_one_shows_the_default_page(self, size):
        block = self.paged(SUBJECT_FILTER, size=size)
        assert len(self.titles(block)) == 4

    def test_filters_and_the_search_cover_every_page(self):
        self.pick(Subject="python")
        block = self.paged(SUBJECT_FILTER, size=1)
        assert self.titles(block) == ["Plone news"]
        assert self.options(block, "Subject") == ["cooking", "plone", "python", "secret"]
        del self.request.form[f"{BLOCK_ID}.Subject"]
        self.pick(SearchableText="talk")
        assert self.titles(self.paged(TEXT_FILTER, size=1)) == ["Plone talk"]

    def test_the_maximum_still_limits_the_whole_listing(self):
        block = self.paged(SUBJECT_FILTER, size=2, limit=3)
        assert self.titles(block) == ["Cooking page", "Plone news"]
        assert self.pages(block) == "Page 1 of 2"

    def test_a_listing_without_filters_ignores_it(self):
        assert len(self.titles(self.paged(size=1))) == 4


class TestCache(ListingCase):
    def test_one_query_serves_repeated_renders(self):
        counted = mock.Mock(wraps=filtered_listing_block_view.listing_brains)
        with mock.patch.object(filtered_listing_block_view, "listing_brains", counted):
            self.render(listing(SUBJECT_FILTER))
            self.render(listing(SUBJECT_FILTER))
        assert counted.call_count == 1

    def test_new_content_shows_up(self):
        self.render(listing(SUBJECT_FILTER))
        self._page(self.base, "New page", ["brandnew"], kind="Document")
        assert "brandnew" in self.options(self.render(listing(SUBJECT_FILTER)), "Subject")

    def test_changed_settings_do_not_share_an_entry(self):
        self.render(listing(SUBJECT_FILTER))
        block = self.render(listing({"field": "Subject", "allowList": ["plone"]}))
        assert self.options(block, "Subject") == ["plone"]


class TestInjection(ListingCase):
    def regions(self, element):
        config = element.get("data-pat-inject")
        return [swap.split(";")[0].strip() for swap in config.split("&&")]

    def test_every_way_of_narrowing_injects(self):
        self.pick(Subject="plone")
        block = self.render(listing(TEXT_FILTER, SUBJECT_FILTER, b_size=1))
        triggers = [
            *block.xpath('.//form[@role="search"]'),
            *block.xpath('.//ul[@data-listing-filter="Subject"]//a'),
            *block.xpath('.//a[contains(@class, "listing-filters-reset")]'),
            *block.xpath('.//nav[contains(@class, "listing-pager")]//a'),
        ]
        assert len(triggers) >= 4
        for trigger in triggers:
            assert "pat-inject" in trigger.get("class").split()
            assert trigger.get("data-pat-inject").count("history: record") == 1

    def test_the_cache_buster_of_an_injection_stays_out_of_the_links(self):
        self.request.set("QUERY_STRING", "other.Subject=news&_=1793813503151")
        block = self.render(listing(TEXT_FILTER, SUBJECT_FILTER))
        (state,) = block.xpath('.//*[@id="listing-block-1-state"]')
        assert [input_.get("name") for input_ in state.xpath(".//input")] == ["other.Subject"]
        href = self.href(block, "Subject", "python")
        assert "other.Subject=news" in href
        assert "_=" not in href

    def test_every_region_is_rendered_to_swap(self):
        block = self.render(listing(TEXT_FILTER, SUBJECT_FILTER))
        (form,) = block.xpath('.//form[@role="search"]')
        for region in self.regions(form):
            (selector,) = re.fullmatch(r"source: #(\S+)::element", region).groups()
            assert len(block.xpath(f'.//*[@id="{selector}"]')) == 1

    def test_the_field_being_typed_in_is_outside_every_region(self):
        block = self.render(listing(TEXT_FILTER, SUBJECT_FILTER))
        (form,) = block.xpath('.//form[@role="search"]')
        (field,) = block.xpath('.//input[@type="search"]')
        ids = {ancestor.get("id") for ancestor in field.iterancestors()}
        assert not ids & {
            re.fullmatch(r"source: #(\S+)::element", region).group(1)
            for region in self.regions(form)
        }

    def test_the_selection_in_the_form_is_swapped_with_the_results(self):
        self.pick(Subject="plone")
        block = self.render(listing(TEXT_FILTER, SUBJECT_FILTER))
        (state,) = block.xpath('.//*[@id="listing-block-1-state"]')
        assert state.xpath('.//input[@name="block-1.Subject"]')[0].get("value") == "plone"

    def test_a_filter_with_nothing_to_offer_keeps_its_place_hidden(self):
        self.pick(SearchableText="nothing-matches-this")
        block = self.render(listing(TEXT_FILTER, SUBJECT_FILTER))
        (group,) = block.xpath('.//*[@id="listing-block-1-filter-Subject"]')
        assert group.get("hidden") is not None

    def test_nothing_to_reset_keeps_its_place_hidden(self):
        block = self.render(listing(SUBJECT_FILTER))
        (reset,) = block.xpath('.//*[@id="listing-block-1-reset"]')
        assert reset.get("hidden") is not None

    def test_the_pager_is_inside_the_results_region(self):
        block = self.render(listing(SUBJECT_FILTER, b_size=1))
        (results,) = block.xpath('.//*[@id="listing-block-1-results"]')
        assert results.xpath('.//div[@class="listing-items"]')
        assert results.xpath('.//nav[contains(@class, "listing-pager")]')

    def test_a_listing_with_nothing_found_still_has_the_region(self):
        self.pick(SearchableText="nothing-matches-this")
        block = self.render(listing(TEXT_FILTER))
        (results,) = block.xpath('.//*[@id="listing-block-1-results"]')
        assert results.xpath('.//p[@class="listing-empty"]')

    def test_the_pager_scrolls_back_to_the_results_and_the_options_do_not(self):
        block = self.render(listing(SUBJECT_FILTER, b_size=1))
        (link,) = block.xpath('.//nav[contains(@class, "listing-pager")]//a')
        assert "scroll: #listing-block-1-results" in link.get("data-pat-inject")
        assert "scroll" not in block.xpath(".//ul//a")[0].get("data-pat-inject")

    def test_the_live_search_script_is_linked(self):
        block = self.render(listing(TEXT_FILTER))
        (script,) = block.xpath(".//script")
        assert script.get("type") == "module"
        assert script.get("src").endswith(
            "/++plone++derico.blicca.listingfilters/listing-filters-live.js"
        )


class TestEditorPreview(ListingCase):
    def preview(self, *filters, state=None, **querystring):
        data = listing(*filters, **querystring)
        if state is not None:
            data["filtersPreview"] = state
        return self.render(data, block_id="")

    def test_nothing_a_visitor_sent_is_read(self):
        self.request.form["Subject"] = "python"
        self.request.form[".Subject"] = "python"
        block = self.preview(SUBJECT_FILTER)
        assert "Cooking page" in self.titles(block)
        assert self.selected(block, "Subject") == []

    def test_options_lead_nowhere(self):
        block = self.preview(SUBJECT_FILTER)
        assert self.href(block, "Subject", "python") == "#"

    def test_the_search_can_be_typed_in(self):
        block = self.preview(TEXT_FILTER)
        assert not block.xpath(".//fieldset[@disabled]")

    def test_nothing_injects_or_loads_a_script(self):
        block = self.preview(TEXT_FILTER, SUBJECT_FILTER, state={"Subject": ["plone"]}, b_size=1)
        assert not block.xpath('.//*[contains(@class, "pat-inject")]')
        assert not block.xpath(".//*[@data-pat-inject]")
        assert not block.xpath(".//script")

    def test_the_preview_state_narrows(self):
        block = self.preview(SUBJECT_FILTER, state={"Subject": ["python"]})
        assert self.titles(block) == ["Plone news"]
        assert self.selected(block, "Subject") == ["python"]

    def test_the_preview_state_searches(self):
        block = self.preview(TEXT_FILTER, state={"SearchableText": "Kartoffelsuppe"})
        assert self.titles(block) == ["Cooking page"]

    def test_the_preview_state_turns_the_page(self):
        block = self.preview(SUBJECT_FILTER, state={"b_start": 2}, b_size=2)
        assert self.titles(block) == ["Plone talk", "Secret page"]
        (link,) = block.xpath('.//nav[contains(@class, "listing-pager")]//a')
        assert link.get("data-listing-start") == "0"

    def test_a_selected_preview_offers_reset(self):
        block = self.preview(SUBJECT_FILTER, state={"Subject": ["python"]})
        assert block.xpath('.//a[contains(@class, "listing-filters-reset")]')

    def test_options_name_their_value(self):
        block = self.preview(SUBJECT_FILTER)
        values = block.xpath('.//ul[@data-listing-filter="Subject"]//a/@data-listing-value')
        assert "python" in values

    def test_a_stored_page_ignores_the_preview_state(self):
        data = listing(SUBJECT_FILTER)
        data["filtersPreview"] = {"Subject": ["python"]}
        assert "Cooking page" in self.titles(self.render(data))

    @pytest.mark.parametrize("state", ["junk", ["Subject"], 3])
    def test_a_malformed_preview_state_is_no_state(self, state):
        block = self.preview(SUBJECT_FILTER, state=state)
        assert "Cooking page" in self.titles(block)


class TestStoredBlock(ListingCase):
    def test_a_page_passes_the_id_of_the_stored_block(self):
        page = api.content.create(container=self.portal, type="Document", id="page", title="Page")
        alsoProvides(page, IBlocks)
        page.blocks = {"stored": listing(SUBJECT_FILTER)}
        page.blocks_layout = {"items": ["stored"]}
        self.request.form["stored.Subject"] = "python"
        view = getMultiAdapter((page, self.request), name="aurora-blocks-view")
        block = lxml.html.fromstring(view.render())
        assert self.titles(block) == ["Plone news"]
