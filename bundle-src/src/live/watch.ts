import { liveTerm } from '../live-term';

const SEARCH_FIELD = '.listing-filters-search input[type=search]';
const DELAY = 300;

const sentTerms = new WeakMap<HTMLFormElement, string>();
const timers = new WeakMap<HTMLFormElement, ReturnType<typeof setTimeout>>();
let focusWatcher: MutationObserver | undefined;

const ownerOf = (element: Element) => element.closest<HTMLElement>('[data-listing-block]');

const otherListingsParams = (search: string, owner: HTMLElement) =>
  [...new URLSearchParams(search)].filter(
    ([name]) => !name.startsWith(`${owner.dataset.listingBlock}.`),
  );

function searchWhenSettled(form: HTMLFormElement, field: HTMLInputElement) {
  clearTimeout(timers.get(form));
  timers.set(
    form,
    setTimeout(() => {
      // pat-inject drops a submit while its last one is in flight.
      if (form.classList.contains('executing')) {
        searchWhenSettled(form, field);
        return;
      }
      const term = liveTerm(field.value);
      if (term !== null && term !== (sentTerms.get(form) ?? field.defaultValue.trim())) {
        form.requestSubmit();
      }
    }, DELAY),
  );
}

function clearSearch(owner: HTMLElement) {
  const field = owner.querySelector<HTMLInputElement>(SEARCH_FIELD);
  if (!field?.form) return;
  clearTimeout(timers.get(field.form));
  field.value = '';
  sentTerms.set(field.form, '');
}

/** pat-inject read this link's URL when the page loaded, before another listing moved on. */
function repointIfStale(link: HTMLAnchorElement, owner: HTMLElement, location: Location) {
  const url = new URL(link.href);
  const current = otherListingsParams(location.search, owner);
  const linked = otherListingsParams(url.search, owner);
  if (JSON.stringify(current) === JSON.stringify(linked)) return false;
  const own = [...url.searchParams].filter(
    ([name]) => name.startsWith(`${owner.dataset.listingBlock}.`),
  );
  url.search = new URLSearchParams([...current, ...own]).toString();
  link.href = url.href;
  return true;
}

function refreshOtherListingsInputs(form: HTMLFormElement, owner: HTMLElement, location: Location) {
  const state = form.querySelector('[hidden]');
  if (!state) return;
  for (const input of state.querySelectorAll('input')) {
    if (!input.name.startsWith(`${owner.dataset.listingBlock}.`)) input.remove();
  }
  for (const [name, value] of otherListingsParams(location.search, owner)) {
    const input = form.ownerDocument.createElement('input');
    Object.assign(input, { type: 'hidden', name, value });
    state.append(input);
  }
}

function successorOf(link: HTMLAnchorElement, block: string, root: HTMLElement) {
  const document = link.ownerDocument;
  const field = link.closest<HTMLElement>('[data-listing-filter]')?.dataset.listingFilter;
  const value = link.dataset.listingValue;
  const rel = link.rel;
  return () => {
    if (field) {
      return [...root.querySelectorAll<HTMLElement>('[data-listing-filter] a')].find(
        (candidate) =>
          candidate.dataset.listingValue === value &&
          candidate.closest<HTMLElement>('[data-listing-filter]')?.dataset.listingFilter === field,
      );
    }
    const pager = document.getElementById(`listing-${block}-results`);
    return rel
      ? (pager?.querySelector<HTMLElement>(`.listing-pager a[rel=${rel}]`) ??
          pager?.querySelector<HTMLElement>('.listing-pager a'))
      : null;
  };
}

/** The swap removes the link a keyboard user is on. */
function keepFocusAcrossSwap(link: HTMLAnchorElement, owner: HTMLElement) {
  const document = link.ownerDocument;
  const block = owner.dataset.listingBlock!;
  const root = document.getElementById(`listing-${block}`);
  if (!root?.parentElement) return;
  const find = successorOf(link, block, root);
  focusWatcher?.disconnect();
  focusWatcher = new MutationObserver(() => {
    if (link.isConnected) return;
    focusWatcher?.disconnect();
    if (document.activeElement && document.activeElement !== document.body) return;
    const next = find();
    if (next) {
      next.focus({ preventScroll: true });
    } else {
      root.tabIndex = -1;
      root.focus({ preventScroll: true });
    }
  });
  focusWatcher.observe(root.parentElement, { childList: true, subtree: true });
}

function onClick(event: MouseEvent) {
  const link = (event.target as Element).closest<HTMLAnchorElement>('a.pat-inject');
  const owner = link && ownerOf(link);
  if (!link || !owner) return;
  const window = link.ownerDocument.defaultView!;
  // A new tab or window, and a stale link, are plain links: pat-inject never sees them.
  const opensElsewhere = event.ctrlKey || event.metaKey || event.shiftKey || event.altKey;
  if (opensElsewhere || repointIfStale(link, owner, window.location)) {
    event.stopPropagation();
    return;
  }
  if (link.matches('.listing-filters-reset')) clearSearch(owner);
  keepFocusAcrossSwap(link, owner);
}

function onSubmit(event: SubmitEvent) {
  const form = event.target as HTMLFormElement;
  const field = form.querySelector<HTMLInputElement>(SEARCH_FIELD);
  const owner = ownerOf(form);
  if (!field || !owner || !form.matches('.pat-inject')) return;
  if (form.classList.contains('executing')) {
    searchWhenSettled(form, field);
    return;
  }
  clearTimeout(timers.get(form));
  sentTerms.set(form, field.value.trim());
  refreshOtherListingsInputs(form, owner, form.ownerDocument.defaultView!.location);
}

function onType(event: Event) {
  const field = event.target as HTMLInputElement;
  if (!field.matches(SEARCH_FIELD) || !field.form?.matches('.pat-inject')) return;
  if ((event as InputEvent).isComposing) return;
  searchWhenSettled(field.form, field);
}

export function watchListings(document: Document) {
  // Capturing, to run before pat-inject's own listeners on the element.
  document.addEventListener('click', onClick, true);
  document.addEventListener('submit', onSubmit, true);
  document.addEventListener('input', onType);
  document.addEventListener('compositionend', onType);
}
