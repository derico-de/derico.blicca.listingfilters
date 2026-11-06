# Changelog

## 1.0.0a1 (unreleased)

- Image results link to `/view` instead of the raw image in filtered and
  unfiltered listings, through the shared Aurora listing-item renderer.

- Initial release: filters on the Listing block. Visitors narrow a listing by
  tags, other properties or a text search, with options from that listing's
  own results.
- Put the filters side by side where the listing has room for them: the
  search is 30ch wide and the other filters share the rest.
- Label the title field of a filter, whose placeholder read as a set value.
- Narrow without loading the page: options, the pager and reset swap the
  results with `pat-inject`, and the search does so as you type, from the third
  letter. The editor's canvas narrows the same way, without storing anything.
- Add a **Results per page** setting, so a listing can show few results at a
  time while its filters and search still cover all of them.
- Move **Results per page** directly above **Maximum results** in the default
  listing settings, outside the collapsed **Filters** section.
