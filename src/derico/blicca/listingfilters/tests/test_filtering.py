"""What a filter leaves and offers, on plain data."""

from derico.blicca.listingfilters.filtering import narrow
from derico.blicca.listingfilters.filtering import ordered_options


BASE = [
    ("news", {"Subject": {"plone", "python"}, "portal_type": {"News Item"}}),
    ("talk", {"Subject": {"plone"}, "portal_type": {"Event"}}),
    ("page", {"Subject": {"cooking"}, "portal_type": {"Document"}}),
    ("bare", {"Subject": set(), "portal_type": {"Document"}}),
]
NO_ALLOW_LISTS = {"Subject": [], "portal_type": []}


class TestResults:
    def test_no_selection_keeps_the_base_results_in_their_order(self):
        results, _options, _selected = narrow(BASE, NO_ALLOW_LISTS, {})
        assert results == ["news", "talk", "page", "bare"]

    def test_values_of_one_filter_widen_each_other(self):
        results, _options, _selected = narrow(
            BASE, NO_ALLOW_LISTS, {"Subject": {"python", "cooking"}}
        )
        assert results == ["news", "page"]

    def test_different_filters_narrow_each_other(self):
        results, _options, _selected = narrow(
            BASE,
            NO_ALLOW_LISTS,
            {"Subject": {"plone"}, "portal_type": {"Event"}},
        )
        assert results == ["talk"]

    def test_text_matches_narrow_too(self):
        results, _options, _selected = narrow(
            BASE, NO_ALLOW_LISTS, {"Subject": {"plone"}}, text_matches={"talk", "page"}
        )
        assert results == ["talk"]


class TestOptions:
    def test_options_come_from_the_base_results_only(self):
        _results, options, _selected = narrow(BASE, NO_ALLOW_LISTS, {})
        assert options["Subject"] == {"plone", "python", "cooking"}
        assert options["portal_type"] == {"News Item", "Event", "Document"}

    def test_a_filter_ignores_its_own_selection_for_its_options(self):
        _results, options, _selected = narrow(BASE, NO_ALLOW_LISTS, {"Subject": {"cooking"}})
        assert options["Subject"] == {"plone", "python", "cooking"}

    def test_other_filters_limit_a_filters_options(self):
        _results, options, _selected = narrow(BASE, NO_ALLOW_LISTS, {"Subject": {"cooking"}})
        assert options["portal_type"] == {"Document"}

    def test_a_value_that_finds_nothing_is_not_offered(self):
        _results, options, _selected = narrow(BASE, NO_ALLOW_LISTS, {"portal_type": {"Event"}})
        assert options["Subject"] == {"plone"}

    def test_text_matches_limit_every_filters_options(self):
        _results, options, _selected = narrow(BASE, NO_ALLOW_LISTS, {}, text_matches={"page"})
        assert options["Subject"] == {"cooking"}
        assert options["portal_type"] == {"Document"}

    def test_a_selected_value_stays_offered_to_be_deselected(self):
        _results, options, selected = narrow(
            BASE,
            NO_ALLOW_LISTS,
            {"Subject": {"cooking"}, "portal_type": {"Event"}},
        )
        assert selected["Subject"] == {"cooking"}
        assert "cooking" in options["Subject"]
        assert "Event" in options["portal_type"]

    def test_an_allow_list_limits_the_options(self):
        allow_lists = {"Subject": ["plone", "gardening"], "portal_type": []}
        _results, options, _selected = narrow(BASE, allow_lists, {})
        assert options["Subject"] == {"plone"}


class TestSelections:
    def test_a_value_outside_the_base_results_is_ignored(self):
        results, _options, selected = narrow(BASE, NO_ALLOW_LISTS, {"Subject": {"crafted"}})
        assert results == ["news", "talk", "page", "bare"]
        assert selected["Subject"] == set()

    def test_a_value_outside_the_allow_list_is_ignored(self):
        allow_lists = {"Subject": ["plone"], "portal_type": []}
        results, _options, selected = narrow(BASE, allow_lists, {"Subject": {"cooking"}})
        assert results == ["news", "talk", "page", "bare"]
        assert selected["Subject"] == set()

    def test_a_field_that_is_no_filter_is_ignored(self):
        results, _options, selected = narrow(BASE, NO_ALLOW_LISTS, {"Creator": {"admin"}})
        assert results == ["news", "talk", "page", "bare"]
        assert "Creator" not in selected


class TestOrder:
    def test_alphabetical_by_title_ignoring_case_without_an_allow_list(self):
        titles = {"a": "Zebra", "b": "apple", "c": "Mango"}
        assert ordered_options(titles, []) == ["b", "c", "a"]

    def test_an_allow_list_sets_the_order(self):
        assert ordered_options({"a": "A", "b": "B"}, ["b", "gone", "a"]) == ["b", "a"]
