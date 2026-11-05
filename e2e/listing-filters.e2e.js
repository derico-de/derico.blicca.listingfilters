/* E2E: staff set up filters on a listing, visitors narrow it.
 *
 *  1. In the editor, results per page stays visible above maximum results
 *     with Filters collapsed. Filters adds a Tag filter with an allow list
 *     and a text search. The canvas narrows
 *     like a public page:
 *     options, the live search from the third letter, the pager and reset
 *     all work, stay in the editor, and none of it is stored.
 *  2. Saved, a visitor sees the allow list's options, in its order. An
 *     allowed tag only found outside the listing's results is not offered.
 *  3. An option narrows the results and the other filters' options, and
 *     shows as selected, without loading the page.
 *  4. The search narrows from the third letter while the field keeps its
 *     focus, and reset brings all results back.
 *  5. The pager walks the results.
 *  6. The URL holds the selection and the page, and Back returns to the last
 *     one.
 *  7. The listing without filters on the same page is left alone.
 *  8. A result image shows a placeholder of its own size until it has loaded,
 *     on the page's first load and after a swap.
 *
 * Prerequisites: a running Plone site with derico.blicca.listingfilters
 * installed. Configure via environment:
 *   AURORA_E2E_BASE       site to build the fixture in
 *                         (default http://localhost:8099/Plone1; Plone leaves
 *                         127.0.0.1 unthemed, so use a host name)
 *   AURORA_E2E_USER       login    (default admin)
 *   AURORA_E2E_PASSWORD   password (default admin)
 *   AURORA_E2E_CHROMIUM   chromium executable (default: playwright-core's)
 *   AURORA_E2E_PAGE_TYPE  fixture portal_type (default Document) — set to
 *                         Article where only that type has blocks
 *   AURORA_E2E_SHOTS      directory for screenshots (default: none)
 *
 * Run: pnpm e2e   (after `pnpm install` in this directory)
 */
const { chromium } = require('playwright-core');

const BASE = process.env.AURORA_E2E_BASE || 'http://localhost:8099/Plone1';
const USER = process.env.AURORA_E2E_USER || 'admin';
const PASSWORD = process.env.AURORA_E2E_PASSWORD || 'admin';
const EXECUTABLE = process.env.AURORA_E2E_CHROMIUM;
const PAGE_TYPE = process.env.AURORA_E2E_PAGE_TYPE || 'Document';
const SHOTS = process.env.AURORA_E2E_SHOTS;
const AUTH = 'Basic ' + Buffer.from(`${USER}:${PASSWORD}`).toString('base64');

const FOLDER_ID = 'listingfilters-e2e';
const ELSEWHERE_ID = 'listingfilters-e2e-elsewhere';
const PAGE_ID = 'page';
const BLOCK_ID = 'filtered';
const SECOND_ID = 'second';
const RED = 'e2e-red';
const BLUE = 'e2e-blue';
const GREEN = 'e2e-green';
const ELSEWHERE_TAG = 'e2e-elsewhere';

// A transparent pixel: a placeholder left behind it would show.
const IMAGE = {
  data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  encoding: 'base64',
  filename: 'pixel.png',
  'content-type': 'image/png',
};

const ITEMS = [
  { id: 'alpha', title: 'Alpha', subjects: [RED, BLUE], description: 'First' },
  { id: 'beta', title: 'Beta', subjects: [RED], description: 'Second' },
  { id: 'gamma', title: 'Gamma', subjects: [GREEN], description: 'Holds the needle', image: IMAGE },
];

async function api(method, path, body) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: AUTH },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (response.status === 423 && method === 'DELETE') {
    await api('DELETE', `${path}/@lock`, { force: true });
    return api(method, path, body);
  }
  if (!response.ok && response.status !== 404) {
    throw new Error(`${method} ${path} -> ${response.status}`);
  }
  return response.status === 204 || response.status === 404 ? undefined : response.json();
}

async function cleanup() {
  await api('DELETE', `/${FOLDER_ID}/${PAGE_ID}`);
  await api('DELETE', `/${FOLDER_ID}`);
  await api('DELETE', `/${ELSEWHERE_ID}`);
}

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

function expectEqual(actual, expected, what) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${what}: ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  } else {
    console.log(`ok: ${what}`);
  }
}

async function until(read, expected, what, timeout = 8000) {
  const deadline = Date.now() + timeout;
  let actual = await read();
  while (JSON.stringify(actual) !== JSON.stringify(expected) && Date.now() < deadline) {
    await new Promise((settled) => setTimeout(settled, 50));
    actual = await read();
  }
  expectEqual(actual, expected, what);
}

const shownTitles = async (listing) =>
  (await listing.locator('.listing-items :is(h2, h3, h4)').allTextContents()).map((title) => title.trim());

const listingBlock = (id, headline, paging = { b_size: 2 }) => ({
  type: 'ploneBlock',
  '@type': 'listing',
  id,
  headline,
  variation: 'summary',
  querystring: {
    ...paging,
    sort_on: 'sortable_title',
    query: [
      { i: 'path', o: 'plone.app.querystring.operation.string.absolutePath', v: `/${FOLDER_ID}::1` },
      { i: 'portal_type', o: 'plone.app.querystring.operation.selection.any', v: ['News Item'] },
    ],
  },
  children: [{ text: '' }],
});

async function buildFixture() {
  await cleanup();
  await api('POST', '/', { '@type': 'Folder', id: FOLDER_ID, title: 'Listing filters e2e' });
  await api('POST', `/${FOLDER_ID}/@workflow/publish`);
  for (const { subjects, ...item } of ITEMS) {
    await api('POST', `/${FOLDER_ID}`, { '@type': 'News Item', ...item, subjects });
    await api('POST', `/${FOLDER_ID}/${item.id}/@workflow/publish`);
  }
  await api('POST', '/', { '@type': 'Folder', id: ELSEWHERE_ID, title: 'Elsewhere', subjects: [ELSEWHERE_TAG] });
  await api('POST', `/${ELSEWHERE_ID}/@workflow/publish`);
  await api('POST', `/${FOLDER_ID}`, {
    '@type': PAGE_TYPE,
    id: PAGE_ID,
    title: 'Listing filters e2e page',
    blocks: {
      __somersault__: {
        '@type': '__somersault__',
        value: [
          { type: 'title', children: [{ text: 'Listing filters e2e page' }] },
          listingBlock(BLOCK_ID, 'Filtered', {}),
          listingBlock('plain', 'Plain'),
        ],
      },
    },
    blocks_layout: { items: ['__somersault__'] },
  });
  await api('POST', `/${FOLDER_ID}/${PAGE_ID}/@workflow/publish`);
}

async function setUpFiltersInTheEditor(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[name="__ac_name"]', USER);
  await page.fill('input[name="__ac_password"]', PASSWORD);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.press('input[name="__ac_password"]', 'Enter'),
  ]);
  await page.goto(`${BASE}/${FOLDER_ID}/${PAGE_ID}/@@aurora-edit`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-slate-editor]', { timeout: 90000 });
  const block = page.locator(`[data-slate-editor] [data-block-id="${BLOCK_ID}"]`);
  await block.locator('.listing-items').waitFor({ timeout: 15000 });
  await block.click();

  const sidebar = page.locator('#sidebar');
  const filtersToggle = sidebar.getByRole('button', { name: 'Filters', exact: true });
  await filtersToggle.waitFor();
  expectEqual(await filtersToggle.getAttribute('aria-expanded'), 'false', 'Filters starts collapsed');
  const batchSize = sidebar.getByLabel('Results per page');
  expectEqual(await batchSize.isVisible(), true, 'results per page is visible with Filters collapsed');
  const batchBounds = await batchSize.boundingBox();
  const limitBounds = await sidebar.getByLabel('Maximum results', { exact: true }).boundingBox();
  expectEqual(
    Boolean(batchBounds && limitBounds && batchBounds.y + batchBounds.height <= limitBounds.y),
    true,
    'results per page is rendered above maximum results',
  );
  if (SHOTS) {
    await batchSize.scrollIntoViewIfNeeded();
    await sidebar.screenshot({ path: `${SHOTS}/sidebar.png` });
  }
  await filtersToggle.click();
  const widget = sidebar.getByRole('group', { name: 'Filter the results by' });
  const add = widget.getByRole('button', { name: 'Add filter' });
  await add.waitFor({ timeout: 15000 });
  await page.waitForFunction(
    () => [...document.querySelectorAll('.listing-filters-widget button')].some((b) => b.textContent === 'Add filter' && !b.disabled),
    null,
    { timeout: 15000 },
  );

  await add.click();
  await widget.getByRole('combobox', { name: 'Filter 1 property' }).selectOption('Subject');
  await widget.getByRole('textbox', { name: 'Filter 1 title' }).fill('Topic');
  const allowed = widget.getByRole('combobox', { name: 'Add an allowed value to filter 1' });
  await allowed.selectOption(GREEN);
  await allowed.selectOption(RED);
  await allowed.selectOption(ELSEWHERE_TAG);
  await add.click();
  await widget.getByRole('combobox', { name: 'Filter 2 property' }).selectOption('SearchableText');

  const glyph = await widget.getByRole('button', { name: `Remove ${RED}` }).evaluate((node) => {
    const style = getComputedStyle(node);
    return style.color !== style.backgroundColor;
  });
  expectEqual(glyph, true, 'the sidebar buttons show their glyphs');

  const options = block.locator('.listing-filter-options a');
  await options.first().waitFor({ timeout: 15000 });
  await page.waitForFunction(
    (id) => document.querySelector(`[data-block-id="${id}"] .listing-filters-search`),
    BLOCK_ID,
    { timeout: 15000 },
  );
  expectEqual(await options.allTextContents(), [GREEN, RED], 'the canvas previews the filters');
  await until(() => shownTitles(block), ['Alpha', 'Beta', 'Gamma'], 'all results fit the default page');
  expectEqual(await batchSize.getAttribute('type'), 'number', 'the batch size takes a number');
  await batchSize.fill('2');
  await until(() => shownTitles(block), ['Alpha', 'Beta'], 'the canvas pages by the batch size');
  const editing = page.url();
  await narrowOnTheCanvas(page, block, options);
  expectEqual(page.url(), editing, 'narrowing the preview stays in the editor');

  await Promise.all([
    page.waitForResponse((response) => response.request().method() === 'PATCH' && response.ok(), { timeout: 15000 }),
    page.click('.aurora-save'),
  ]);
  const saved = await api('GET', `/${FOLDER_ID}/${PAGE_ID}`);
  const stored = saved.blocks.__somersault__.value.find((node) => node.id === BLOCK_ID);
  expectEqual(
    stored.filters,
    [
      { allowList: [GREEN, RED, ELSEWHERE_TAG], field: 'Subject', title: 'Topic' },
      { allowList: [], field: 'SearchableText', title: '' },
    ],
    'the setting is stored',
  );
  expectEqual(Number(stored.batchSize), 2, 'the batch size is stored');
  expectEqual(stored.filtersPreview, undefined, 'what narrowed the preview is not stored');
}

async function narrowOnTheCanvas(page, block, options) {
  const search = block.locator('.listing-filters-search input[type=search]');
  const titles = () => shownTitles(block);
  const hasFocus = () => search.evaluate((field) => document.activeElement === field);
  const selected = block.locator('.listing-filter-options a[aria-current]');

  await options.filter({ hasText: RED }).click();
  await until(() => selected.allTextContents(), [RED], 'a preview option shows as selected');
  await until(titles, ['Alpha', 'Beta'], 'a preview option narrows the results');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/editor.png`, fullPage: true });
  await options.filter({ hasText: RED }).click();
  await until(() => selected.count(), 0, 'a second click deselects it');

  await block.locator('.listing-pager a[rel=next]').click();
  await until(titles, ['Gamma'], 'the preview pager shows the next page');
  await block.locator('.listing-pager a[rel=prev]').click();
  await until(titles, ['Alpha', 'Beta'], 'the preview pager goes back');

  await search.click();
  await search.pressSequentially('ne', { delay: 40 });
  await page.waitForTimeout(600);
  expectEqual(await titles(), ['Alpha', 'Beta'], 'the preview does not search for two letters');
  await search.pressSequentially('edle', { delay: 40 });
  await until(titles, ['Gamma'], 'the preview searches live');
  expectEqual(await search.inputValue(), 'needle', 'the preview keeps what was typed');
  expectEqual(await hasFocus(), true, 'the preview search keeps its focus');

  await search.press('Backspace');
  await page.waitForTimeout(600);
  expectEqual(await search.inputValue(), 'needl', 'Backspace edits the term');
  expectEqual(await block.count(), 1, 'Backspace leaves the block in place');
  expectEqual(await hasFocus(), true, 'the preview search still has its focus');

  await block.locator('.listing-filters-reset').click();
  await until(titles, ['Alpha', 'Beta'], 'preview reset brings the results back');
  expectEqual(await search.inputValue(), '', 'preview reset empties the search');
}

const underline = (link) => link.evaluate((node) => getComputedStyle(node).textDecorationLine);

async function visit(page) {
  const filtered = page.locator('.listing', { has: page.locator('.listing-filters') });
  const plain = page.locator('.listing', { hasNot: page.locator('.listing-filters') });
  const options = filtered.locator('.listing-filter-options a');
  const url = `${BASE}/${FOLDER_ID}/${PAGE_ID}`;
  // pat-inject swaps the results region last.
  const swapped = async (act) => {
    const results = await filtered.locator('.listing-results').elementHandle();
    await act();
    await page.waitForFunction((element) => !element.isConnected, results, { timeout: 8000 });
  };

  await page.goto(url, { waitUntil: 'load' });
  // pat-inject finds its triggers once the bundle has run.
  await page.waitForFunction(() => document.querySelector('a.pat-inject') && window.jQuery?.(document.querySelector('a.pat-inject')).data('pat-inject'));
  await page.evaluate(() => { window.listingFiltersSameDocument = true; });
  expectEqual(await page.locator('.listing-filters').count(), 1, 'only the listing with filters offers them');
  expectEqual(await filtered.locator('.listing-filter-title').allTextContents(), ['Topic'], 'the title staff chose');
  expectEqual(await options.allTextContents(), [GREEN, RED], 'the allow list limits and orders the options');
  expectEqual(await shownTitles(filtered), ['Alpha', 'Beta'], 'the first page of the base results');

  const look = await options.first().evaluate((node) => {
    const list = getComputedStyle(node.closest('ul'));
    return { display: list.display, listStyle: list.listStyleType };
  });
  expectEqual(look, { display: 'flex', listStyle: 'none' }, 'the stylesheet reaches the options');
  expectEqual(await underline(filtered.locator('.listing-pager a[rel=next]')), 'underline', 'the pager reads as a link');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/public.png`, fullPage: true });

  await swapped(() => filtered.locator('.listing-pager a[rel=next]').click());
  expectEqual(await shownTitles(filtered), ['Gamma'], 'the pager shows the next page');
  expectEqual(new URL(page.url()).searchParams.get(`${BLOCK_ID}.b_start`), '2', 'the page is in the URL');
  expectEqual(await shownTitles(plain), ['Alpha', 'Beta'], 'the pager leaves the listing without filters alone');
  await swapped(() => filtered.locator('.listing-pager a[rel=prev]').click());
  expectEqual(await shownTitles(filtered), ['Alpha', 'Beta'], 'the pager goes back');

  await options.filter({ hasText: RED }).focus();
  await swapped(() => page.keyboard.press('Enter'));
  expectEqual(new URL(page.url()).searchParams.getAll(`${BLOCK_ID}.Subject`), [RED], 'the option is in the URL');
  expectEqual(await shownTitles(filtered), ['Alpha', 'Beta'], 'an option narrows the results');
  expectEqual(
    await page.evaluate(() => document.activeElement?.textContent),
    RED,
    'the keyboard stays on the option it chose',
  );
  expectEqual(await options.allTextContents(), [GREEN, RED], 'a filter keeps its other options');
  const selected = filtered.locator('.listing-filter-options a[aria-current]');
  expectEqual(await selected.allTextContents(), [RED], 'the option shows as selected');
  expectEqual(await underline(filtered.locator('.listing-filters-reset')), 'underline', 'reset reads as a link');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/selected.png`, fullPage: true });

  const search = filtered.locator('.listing-filters-search input[type=search]');
  const offset = await filtered.locator('.listing-filters-search fieldset').evaluate((fieldset) => {
    const bottom = (selector) => fieldset.querySelector(selector).getBoundingClientRect().bottom;
    return Math.round(bottom('input[type=search]') - bottom('button'));
  });
  expectEqual(offset, 0, 'the search box and its button line up');
  await search.fill('needle');
  await swapped(() => search.press('Enter'));
  expectEqual(await filtered.locator('.listing-empty').count(), 1, 'the search narrows within the selection');
  expectEqual(await search.inputValue(), 'needle', 'Enter keeps the term in the field');

  await swapped(() => filtered.locator('.listing-filters-reset').click());
  expectEqual(await shownTitles(filtered), ['Alpha', 'Beta'], 'reset brings the results back');
  expectEqual(await filtered.locator('.listing-filters-reset').isVisible(), false, 'with nothing chosen there is no reset');
  expectEqual(await search.inputValue(), '', 'reset empties the search');
  expectEqual(new URL(page.url()).search, '', 'reset empties the URL');

  await search.click();
  await search.pressSequentially('ne', { delay: 40 });
  await page.waitForTimeout(600);
  expectEqual(await shownTitles(filtered), ['Alpha', 'Beta'], 'two letters do not search yet');
  expectEqual(new URL(page.url()).search, '', 'two letters stay out of the URL');
  await swapped(() => search.pressSequentially('edle', { delay: 40 }));
  await until(() => shownTitles(filtered), ['Gamma'], 'the search narrows live');
  expectEqual(await search.inputValue(), 'needle', 'the field keeps what was typed');
  expectEqual(await search.evaluate((field) => document.activeElement === field), true, 'the field keeps its focus');
  await until(() => new URL(page.url()).searchParams.get(`${BLOCK_ID}.SearchableText`), 'needle', 'the term is in the URL');
  expectEqual(await options.allTextContents(), [GREEN], 'the options follow the text search');
  expectEqual(await shownTitles(plain), ['Alpha', 'Beta'], 'the search leaves the listing without filters alone');
  expectEqual(await page.evaluate(() => window.listingFiltersSameDocument), true, 'nothing so far loaded the page');

  const bookmark = page.url();
  // pat-inject reloads on Back.
  await page.goBack();
  await page.waitForFunction(() => !window.listingFiltersSameDocument);
  await page.waitForLoadState('load');
  expectEqual(await shownTitles(filtered), ['Alpha', 'Beta'], 'Back returns to the last selection');
  await page.goto(bookmark, { waitUntil: 'load' });
  expectEqual(await shownTitles(filtered), ['Gamma'], 'the URL holds the search');
  expectEqual(await search.inputValue(), 'needle', 'the URL fills the field');
}

const placeholderOf = (image) =>
  image.evaluate((node) => ({
    shown: getComputedStyle(node).backgroundColor !== 'rgba(0, 0, 0, 0)',
    sized: node.offsetHeight > 0 && node.offsetWidth > 0,
  }));

/* Holds the images back, as a slow connection would, until `release`. */
async function holdImages(page) {
  let release;
  const released = new Promise((resolve) => { release = resolve; });
  await page.route(/@@images/, async (route) => {
    await released;
    await route.continue();
  });
  return release;
}

async function placeholderUntilLoaded(page, image, when) {
  const release = await holdImages(page);
  await when();
  await image.waitFor();
  expectEqual(await placeholderOf(image), { shown: true, sized: true }, 'a pending image shows a placeholder of its size');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/pending-image.png`, fullPage: true });
  release();
  await page.waitForFunction(
    (node) => node.classList.contains('listing-image-loaded'),
    await image.elementHandle(),
    { timeout: 8000 },
  );
  expectEqual(await placeholderOf(image), { shown: false, sized: true }, 'a loaded image shows none behind it');
  await page.unroute(/@@images/);
}

async function visitWithSlowImages(page) {
  const filtered = page.locator('.listing', { has: page.locator('.listing-filters') });
  const image = filtered.locator('.listing-results .item img');
  const url = `${BASE}/${FOLDER_ID}/${PAGE_ID}`;
  await placeholderUntilLoaded(page, image, () => page.goto(`${url}?${BLOCK_ID}.Subject=${GREEN}`, { waitUntil: 'domcontentloaded' }));

  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.jQuery?.(document.querySelector('a.pat-inject')).data('pat-inject'));
  await placeholderUntilLoaded(page, image, () => filtered.locator('.listing-filter-options a').filter({ hasText: GREEN }).click());
}

/* A second listing with filters: narrowing one keeps the other's selection,
 * though pat-inject read that listing's URLs when the page loaded. */
async function visitTwoListings(page) {
  const first = page.locator(`.listing:has(#listing-${BLOCK_ID})`);
  const second = page.locator(`.listing:has(#listing-${SECOND_ID})`);
  await page.goto(`${BASE}/${FOLDER_ID}/${PAGE_ID}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.jQuery?.(document.querySelector('a.pat-inject')).data('pat-inject'));
  const firstResults = await first.locator('.listing-results').elementHandle();
  await first.locator('.listing-filter-options a').filter({ hasText: GREEN }).click();
  await page.waitForFunction((element) => !element.isConnected, firstResults, { timeout: 8000 });
  expectEqual(await shownTitles(second), ['Alpha', 'Beta'], 'one listing leaves the other alone');

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'load' }),
    second.locator('.listing-filter-options a').filter({ hasText: BLUE }).click(),
  ]);
  const params = new URL(page.url()).searchParams;
  expectEqual(
    [params.get(`${BLOCK_ID}.Subject`), params.get(`${SECOND_ID}.Subject`)],
    [GREEN, BLUE],
    'the other listing keeps its selection',
  );
  expectEqual(await shownTitles(first), ['Gamma'], 'the first listing is still narrowed');
  expectEqual(await shownTitles(second), ['Alpha'], 'the second listing is narrowed too');
}

async function addSecondFilteredListing() {
  const path = `/${FOLDER_ID}/${PAGE_ID}`;
  const { blocks } = await api('GET', path);
  const filters = [{ field: 'Subject', title: '', allowList: [] }];
  const value = [
    ...blocks.__somersault__.value.map(({ items: _derived, ...node }) => node),
    { ...listingBlock(SECOND_ID, 'Second'), filters },
  ];
  await api('PATCH', path, { blocks: { ...blocks, __somersault__: { ...blocks.__somersault__, value } } });
}

(async () => {
  await buildFixture();
  const browser = await chromium.launch(EXECUTABLE ? { executablePath: EXECUTABLE } : {});
  const pageErrors = [];
  const newPage = async (context) => {
    const page = await context.newPage();
    page.on('pageerror', (error) => pageErrors.push(error.stack || String(error)));
    page.on('dialog', (dialog) => dialog.accept());
    return page;
  };

  try {
    const viewport = { width: 1400, height: 1000 };
    await setUpFiltersInTheEditor(await newPage(await browser.newContext({ viewport })));
    await visit(await newPage(await browser.newContext({ viewport })));
    await visitWithSlowImages(await newPage(await browser.newContext({ viewport })));
    await addSecondFilteredListing();
    await visitTwoListings(await newPage(await browser.newContext({ viewport })));
    if (pageErrors.length) fail(`uncaught page errors:\n${pageErrors.join('\n')}`);
    if (process.exitCode !== 1) console.log('PASS');
  } finally {
    await browser.close();
    await cleanup();
  }
})().catch((error) => {
  console.error('E2E crashed:', error);
  process.exit(1);
});
