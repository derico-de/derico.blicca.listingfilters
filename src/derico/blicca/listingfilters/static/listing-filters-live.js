const MIN_LETTERS = 3;
function liveTerm(typed) {
  const term = typed.trim();
  return term === "" || term.length >= MIN_LETTERS ? term : null;
}
const SEARCH_FIELD = ".listing-filters-search input[type=search]";
const DELAY = 300;
const sentTerms = /* @__PURE__ */ new WeakMap();
const timers = /* @__PURE__ */ new WeakMap();
let focusWatcher;
const ownerOf = (element) => element.closest("[data-listing-block]");
const otherListingsParams = (search, owner) => [...new URLSearchParams(search)].filter(
  ([name]) => !name.startsWith(`${owner.dataset.listingBlock}.`)
);
function searchWhenSettled(form, field) {
  clearTimeout(timers.get(form));
  timers.set(
    form,
    setTimeout(() => {
      if (form.classList.contains("executing")) {
        searchWhenSettled(form, field);
        return;
      }
      const term = liveTerm(field.value);
      if (term !== null && term !== (sentTerms.get(form) ?? field.defaultValue.trim())) {
        form.requestSubmit();
      }
    }, DELAY)
  );
}
function clearSearch(owner) {
  const field = owner.querySelector(SEARCH_FIELD);
  if (!field?.form) return;
  clearTimeout(timers.get(field.form));
  field.value = "";
  sentTerms.set(field.form, "");
}
function repointIfStale(link, owner, location) {
  const url = new URL(link.href);
  const current = otherListingsParams(location.search, owner);
  const linked = otherListingsParams(url.search, owner);
  if (JSON.stringify(current) === JSON.stringify(linked)) return false;
  const own = [...url.searchParams].filter(
    ([name]) => name.startsWith(`${owner.dataset.listingBlock}.`)
  );
  url.search = new URLSearchParams([...current, ...own]).toString();
  link.href = url.href;
  return true;
}
function refreshOtherListingsInputs(form, owner, location) {
  const state = form.querySelector("[hidden]");
  if (!state) return;
  for (const input of state.querySelectorAll("input")) {
    if (!input.name.startsWith(`${owner.dataset.listingBlock}.`)) input.remove();
  }
  for (const [name, value] of otherListingsParams(location.search, owner)) {
    const input = form.ownerDocument.createElement("input");
    Object.assign(input, { type: "hidden", name, value });
    state.append(input);
  }
}
function successorOf(link, block, root) {
  const document2 = link.ownerDocument;
  const field = link.closest("[data-listing-filter]")?.dataset.listingFilter;
  const value = link.dataset.listingValue;
  const rel = link.rel;
  return () => {
    if (field) {
      return [...root.querySelectorAll("[data-listing-filter] a")].find(
        (candidate) => candidate.dataset.listingValue === value && candidate.closest("[data-listing-filter]")?.dataset.listingFilter === field
      );
    }
    const pager = document2.getElementById(`listing-${block}-results`);
    return rel ? pager?.querySelector(`.listing-pager a[rel=${rel}]`) ?? pager?.querySelector(".listing-pager a") : null;
  };
}
function keepFocusAcrossSwap(link, owner) {
  const document2 = link.ownerDocument;
  const block = owner.dataset.listingBlock;
  const root = document2.getElementById(`listing-${block}`);
  if (!root?.parentElement) return;
  const find = successorOf(link, block, root);
  focusWatcher?.disconnect();
  focusWatcher = new MutationObserver(() => {
    if (link.isConnected) return;
    focusWatcher?.disconnect();
    if (document2.activeElement && document2.activeElement !== document2.body) return;
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
function onClick(event) {
  const link = event.target.closest("a.pat-inject");
  const owner = link && ownerOf(link);
  if (!link || !owner) return;
  const window = link.ownerDocument.defaultView;
  const opensElsewhere = event.ctrlKey || event.metaKey || event.shiftKey || event.altKey;
  if (opensElsewhere || repointIfStale(link, owner, window.location)) {
    event.stopPropagation();
    return;
  }
  if (link.matches(".listing-filters-reset")) clearSearch(owner);
  keepFocusAcrossSwap(link, owner);
}
function onSubmit(event) {
  const form = event.target;
  const field = form.querySelector(SEARCH_FIELD);
  const owner = ownerOf(form);
  if (!field || !owner || !form.matches(".pat-inject")) return;
  if (form.classList.contains("executing")) {
    searchWhenSettled(form, field);
    return;
  }
  clearTimeout(timers.get(form));
  sentTerms.set(form, field.value.trim());
  refreshOtherListingsInputs(form, owner, form.ownerDocument.defaultView.location);
}
function onType(event) {
  const field = event.target;
  if (!field.matches(SEARCH_FIELD) || !field.form?.matches(".pat-inject")) return;
  if (event.isComposing) return;
  searchWhenSettled(field.form, field);
}
function watchListings(document2) {
  document2.addEventListener("click", onClick, true);
  document2.addEventListener("submit", onSubmit, true);
  document2.addEventListener("input", onType);
  document2.addEventListener("compositionend", onType);
}
watchListings(document);
//# sourceMappingURL=listing-filters-live.js.map
