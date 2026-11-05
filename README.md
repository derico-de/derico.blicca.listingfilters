# derico.blicca.listingfilters

**Listing filters** for the Listing block of the Aurora editor in [Plone](https://plone.org) Blicca.
Blicca is the former Plone Classic UI. Staff add filters to a listing they
already have, and visitors narrow it by tags, other properties or a text
search. The options come from that listing's own results, never from every
tag on the site.

Typical uses:

- a news or event listing narrowed by topic;
- a publications page narrowed by type and a text search;
- a tag filter limited to the few topics an editor wants to offer, in their
  chosen order.

The add-on replaces the Listing block's rendering and adds a setting to its
sidebar. Staff keep a single listing block, one query serves the results and
the options, and a listing with no filters renders exactly as it did.

## Features

- **Options from the listing's own results.** A value that finds nothing is
  not offered, unless it is selected, so a visitor can deselect it. Under each
  filter, the options reflect the other filters' selections, and a filter
  ignores its own, so a visitor can widen the selection again.
- **Properties with values to choose from**, such as the Tag, the type or the
  state, and a **text search**.
- **An allow list per filter.** Staff choose from all the site's values. The
  list limits the options and sets their order.
- **Narrows without loading the page.** Options, the pager and reset swap the
  results in place with `pat-inject`. The search does the same as you type,
  from the third letter, and keeps its focus.
- **Links underneath.** Every option is a link, the search is a plain form.
  The selection is in the URL, per block, so several listings on one page
  stay independent and a narrowed listing can be bookmarked. Without
  JavaScript the same links load the page.
- **A pager over the narrowed results**, with a results-per-page setting for
  the block. Filters and the search cover every page.
- **Translated** into German.

## Requirements

- Plone 6.2 or later, Blicca only
- [plone.blicca.auroraeditor](https://github.com/derico-de/plone.blicca.auroraeditor)
  later than 1.0.0a6, for its listing seams

The JavaScript bundle is committed to the package. No Node is needed at
install time.

## Installation

Add the package to your project's dependencies:

```toml
# pyproject.toml
dependencies = [
    "derico.blicca.listingfilters",
]
```

Then install **Derico Blicca Listingfilters** from Plone's Add-ons control
panel, or apply the `derico.blicca.listingfilters:default` profile.

Only one add-on can own the Listing block. This one declares
`overrides: ["listing"]`, so it cannot be combined with another add-on that
does the same.

## Using the filters

Select a Listing block in the editor and open **Filters** in the sidebar.

- **Add filter** adds a row. Choose its property, and optionally a title in
  place of the property's own.
- **Allowed values** is the allow list. With none chosen, every value found
  in the results is offered.
- The arrows reorder the filters and the allowed values, the cross removes
  them.
- **Results per page** sets the pager's page size, for example 6 for a grid of
  3 × 2. Left empty, the listing's own `b_size` applies, otherwise 25. It is
  stored as `batchSize` in the block's data. **Maximum results** still caps the
  whole listing, so a filter or search finds nothing beyond it. A listing with
  no filters ignores this setting.
- The canvas narrows like a public page: options, the search from the third
  letter, the pager and reset all work, and stay in the editor. What you
  narrow it by is not saved.

A property is offered when it has a catalog index configured for
`plone.app.querystring` with values to choose from, or a vocabulary. To be
narrowed by, it also needs a catalog metadata column. Without one the filter
stays hidden from visitors, and `@querystring` doesn't tell the sidebar which
properties have a column, so it still offers them.

## Rendered markup

Filters render above the results, the pager below them:

```html
<div class="listing-filters" id="listing-<block id>" role="group"
     data-listing-block="<block id>">
  <form class="listing-filters-search pat-inject" role="search">
    <fieldset>
      <label>
        <span class="listing-filter-label">Search</span>
        <input type="search" name="<block id>.SearchableText">
      </label>
      <div id="listing-<block id>-state" hidden><!-- the selection --></div>
      <button type="submit">Search</button>
    </fieldset>
  </form>
  <div class="listing-filter" id="listing-<block id>-filter-Subject">
    <p class="listing-filter-title">Topic</p>
    <ul class="listing-filter-options" data-listing-filter="Subject">
      <li><a class="pat-inject" href="…" data-listing-value="News" aria-current="true">News</a></li>
    </ul>
  </div>
  <div id="listing-<block id>-reset" class="listing-filters-reset-region">
    <a class="listing-filters-reset pat-inject" href="…">Reset filters</a>
  </div>
</div>
<div class="listing-results" id="listing-<block id>-results"
     data-listing-block="<block id>">
  <!-- the listing's items -->
  <nav class="listing-pager" aria-label="Result pages">
    <a class="pat-inject" rel="prev" href="…" data-listing-start="0">Previous</a>
    <span>Page 2 of 3</span>
    <a class="pat-inject" rel="next" href="…" data-listing-start="4">Next</a>
  </nav>
</div>
```

The search field stays out of every region an injection swaps, so typing
carries on while the results change. A filter with nothing to offer, and reset
with nothing to reset, keep their region `hidden`.

## How it works

The add-on registers its own `aurora-block-listing` view on a browser layer
that extends the core block's. It takes the base results from the core
listing's query, then narrows them in Python over the brains' metadata. That
way a filter narrows even on an index the listing's own query already uses.
The text search goes through the catalog, limited to the base results by UID.

A filter's options ignore its own selection. Results and options are cached
together with
`plone.memoize.ram`, keyed by the context, the block's query and selection,
the user's allowed roles, the language and the catalog's counter, and for at
most five minutes, as effective ranges and relative dates move on without the
catalog changing.

Selections travel as `<block id>.<property>` parameters. Parameters of other
blocks are kept in every link.

On a public page, `pat-inject` from Plone's bundle swaps each region on its
own, and its `history: record` keeps the URL on the current selection and page.
`static/listing-filters-live.js` adds what it has no option for: waiting 300ms
and for the third letter before submitting the search, and keeping the keyboard
on the option or pager link a swap replaced.

On the canvas, the add-on wraps the core block's edit component and passes the
preview state as `filtersPreview` in the block's data. The core block's own
preview request carries it to the server, and it is never stored. There, a
view without a block id reads its selection from this state, never from the
request.

Known limits:

- Each injection renders the whole page on the server and takes the regions
  from it, though the results come from the cache.
- Each searched term is one history entry, and Back reloads the page.
- `pat-inject` reads a link's URL when it is set up. With two filtered listings
  on a page, once one has been narrowed, a link in the other loads the whole
  page, to keep both selections.
- The core block's serializer still resolves its `items` for a filtered
  listing. That is one capped query the view does not use.

Disabling the block override's registry record gives the editor back the core
block, while pages keep rendering this one. Uninstalling leaves `filters` in
stored blocks, which the core block ignores, so reinstalling brings them back.

## Theming

The stylesheet is `@scope`-wrapped to the editor and the public blocks view.
Its rules descend from `.listing-filters`, `.listing-pager` or
`.listing-results`. A theme sets
these custom properties, none of which the add-on declares, so an inherited
value wins:

| Custom property | Default | Sets |
| --- | --- | --- |
| `--listing-filters-gap` | `1rem` | the space between the filters, and around them and the pager |
| `--listing-filters-radius` | `1rem` | an option's corners |
| `--listing-filters-accent` | `--bs-primary`, then `#0b5cad` | a selected option and the search button |
| `--listing-filters-accent-contrast` | `#fff` | the text on the accent |

While a request runs, `.listing-results` is dimmed. On a public page it has the
class `injecting`, on the canvas an ancestor has `aria-busy="true"`.

## Using the block in Aurora

The editor half lives in `bundle-src/` as the npm package
`@derico/aurora-listingfilters-block` (not yet published). In Aurora today it
only adds the **Filters** setting to the Listing block:

- **Nothing narrows yet.** Aurora renders its own Listing view, which shows no
  filters, and the narrowing lives in this package's Blicca view.
- **The stylesheet does not apply.** It is scoped to the Blicca roots.
- This has been checked against a registry without an `edit` component, not
  inside a running Aurora application.

## Development

```bash
uv run --extra test pytest
```

`bundle-src/` holds the editor half and the public page's script as Vite
library builds. Their output is committed to
`src/derico/blicca/listingfilters/static/`:

```bash
cd bundle-src
pnpm install
pnpm test
pnpm typecheck
pnpm build
```

`e2e/` drives the add-on in a running site with playwright-core: in the
editor, adding a Tag filter with an allow list and a text search, setting the
results per page, narrowing the canvas, and saving; on the page, as a visitor, the options, the pager, a
selected option, the live search and reset without a page load, a result
image held back keeping its box until it loads, next to a listing without
filters and a second filtered one. It builds its fixture in
the site `AURORA_E2E_BASE` names and removes it again; the add-on must be
installed there. Plone leaves `127.0.0.1` unthemed, so use a host name.

```bash
cd e2e
pnpm install
AURORA_E2E_BASE=http://localhost:8080/Plone AURORA_E2E_PAGE_TYPE=Article pnpm e2e
```

`AURORA_E2E_USER`, `AURORA_E2E_PASSWORD`, `AURORA_E2E_CHROMIUM` (a Chromium
executable) and `AURORA_E2E_SHOTS` (a directory for screenshots) are optional;
the header of `e2e/listing-filters.e2e.js` lists them.

Every change to a GenericSetup profile XML file needs an upgrade step, even
in an alpha release. Scaffold it with `plonecli add upgrade_step`.

## License

GPL-2.0-or-later

## Author

Maik Derstappen, [derico.de](https://derico.de), <md@derico.de>
