# Changelog

## 1.0.0a2 (unreleased)

- Frame each filter in the sidebar's **Filters** setting as a group of its
  own, headed by its number and its move and remove buttons, so a filter
  shows where it starts and ends. Its property gets a label, and the allowed
  values line up with the fields.
- Take the filters' frames, actions and **Add filter** slot from
  plone.blicca.auroraeditor's `aurora-group` classes, so the filters look
  like the listing block's criteria and follow their changes.


## 1.0.0a1 (2026-11-09)

- Image results link to `/view` instead of the raw image in filtered and
  unfiltered listings, through the shared Aurora listing-item renderer.

- Initial release: filters on the Listing block. Visitors narrow a listing by
  tags, other properties or a text search, with options from that listing's
  own results.
- Put the filters side by side where the listing has room for them: the
  search is 30ch wide and the other filters share the rest. Themes can set
  the search width with `--listing-filters-search-width`.
- Space the filters 1.5rem apart and keep the filters and pager 1.5rem from
  the results.
- Leave a listing without an edit component on its view instead of wrapping
  a missing component, so installing the npm package in Aurora does not
  break the editor.
- Keep compiled CSS and JavaScript out of Git diffs; the generated files
  remain tracked and ship with the package.
- Label the title field of a filter, whose placeholder read as a set value.
- Narrow without loading the page: options, the pager and reset swap the
  results with `pat-inject`, and the search does so as you type, from the third
  letter. The editor's canvas narrows the same way, without storing anything.
- Add a **Results per page** setting, so a listing can show few results at a
  time while its filters and search still cover all of them.
- Move **Results per page** directly above **Maximum results** in the default
  listing settings, outside the collapsed **Filters** section.
