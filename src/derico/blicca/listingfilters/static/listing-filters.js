import { jsx, jsxs } from "react/jsx-runtime";
import { useState, useRef, useEffect, useId } from "react";
import config from "@plone/registry";
const MIN_LETTERS = 3;
function liveTerm(typed) {
  const term = typed.trim();
  return term === "" || term.length >= MIN_LETTERS ? term : null;
}
const SEARCH_FIELD = ".listing-filters-search input[type=search]";
const DELAY = 150;
function toggled(state, field, value) {
  const { b_start: _start, ...rest } = state;
  const picked = state[field] ?? [];
  return {
    ...rest,
    [field]: picked.includes(value) ? picked.filter((item) => item !== value) : [...picked, value]
  };
}
function searched(state, term) {
  if ((state.SearchableText ?? "") === term) return state;
  const { b_start: _start, ...rest } = state;
  return { ...rest, SearchableText: term };
}
function withFiltersPreview(CoreEdit) {
  return function FilteredListingEdit(props) {
    const [state, setState] = useState({});
    const container = useRef(null);
    const typed = useRef(null);
    const caret = useRef(null);
    const typing = useRef(false);
    const leftField = useRef(void 0);
    const timer = useRef(void 0);
    useEffect(() => {
      const observer = new MutationObserver(() => {
        const field = container.current?.querySelector(SEARCH_FIELD);
        if (!field) return;
        if (typed.current !== null && field.value !== typed.current) field.value = typed.current;
        if (typing.current && field.ownerDocument.activeElement !== field) {
          field.focus({ preventScroll: true });
          field.setSelectionRange(caret.current, caret.current);
        }
      });
      observer.observe(container.current, { childList: true, subtree: true });
      return () => {
        observer.disconnect();
        clearTimeout(timer.current);
        clearTimeout(leftField.current);
      };
    }, []);
    const search = (typedValue) => {
      clearTimeout(timer.current);
      const term = liveTerm(typedValue);
      if (term === null) return;
      timer.current = setTimeout(() => setState((current) => searched(current, term)), DELAY);
    };
    const onClickCapture = (event) => {
      const link = event.target.closest("a");
      if (!link) return;
      if (link.matches(".listing-filters-reset")) {
        clearTimeout(timer.current);
        typed.current = "";
        const field2 = container.current?.querySelector(SEARCH_FIELD);
        if (field2) field2.value = "";
        setState({});
        return;
      }
      const start = link.dataset.listingStart;
      if (start !== void 0) {
        setState((current) => ({ ...current, b_start: Number(start) }));
        return;
      }
      const field = link.closest("[data-listing-filter]")?.dataset.listingFilter;
      const value = link.dataset.listingValue;
      if (field && value !== void 0) {
        setState((current) => toggled(current, field, value));
      }
    };
    const onInput = (event) => {
      const field = event.target;
      if (!field.matches(SEARCH_FIELD)) return;
      typed.current = field.value;
      caret.current = field.selectionStart;
      if (!event.nativeEvent.isComposing) search(field.value);
    };
    const onSubmitCapture = (event) => {
      event.preventDefault();
      clearTimeout(timer.current);
      const field = event.target.querySelector(SEARCH_FIELD);
      if (field) setState((current) => searched(current, field.value.trim()));
    };
    const onFocusCapture = (event) => {
      if (!event.target.matches(SEARCH_FIELD)) return;
      clearTimeout(leftField.current);
      typing.current = true;
    };
    const onBlurCapture = (event) => {
      const field = event.target;
      if (!field.matches(SEARCH_FIELD)) return;
      caret.current = field.selectionStart;
      leftField.current = setTimeout(() => {
        typing.current = false;
      });
    };
    const data = Object.keys(state).length ? { ...props.data, filtersPreview: state } : props.data;
    return /* @__PURE__ */ jsx(
      "div",
      {
        ref: container,
        onClickCapture,
        onInput,
        onCompositionEnd: onInput,
        onSubmitCapture,
        onFocusCapture,
        onBlurCapture,
        children: /* @__PURE__ */ jsx(CoreEdit, { ...props, data })
      }
    );
  };
}
const TEXT_SEARCH = "SearchableText";
const TEXT_SEARCH_PROPERTY = { field: TEXT_SEARCH, title: "Text search", values: [] };
const NOT_A_PROPERTY = ["show_inactive"];
function isFilterable(field, index) {
  if (index.enabled === false || NOT_A_PROPERTY.includes(field)) return false;
  return Boolean(index.vocabulary) || Object.keys(index.values ?? {}).length > 0;
}
function fromIndexes(indexes) {
  return Object.entries(indexes).filter(([field, index]) => isFilterable(field, index)).map(([field, index]) => ({
    field,
    title: index.title || field,
    values: Object.entries(index.values ?? {}).map(([value, term]) => [
      value,
      term.title || value
    ])
  }));
}
const inflight = /* @__PURE__ */ new Map();
function fetchProperties(url) {
  let pending = inflight.get(url);
  if (!pending) {
    pending = fetch(url, { headers: { Accept: "application/json" }, credentials: "same-origin" }).then((response) => response.ok ? response.json() : null).then((body) => body?.indexes ? fromIndexes(body.indexes) : null).catch(() => null);
    inflight.set(url, pending);
  }
  return pending;
}
function querystringUrl() {
  const base = config.settings?.apiPath;
  const root = typeof base === "string" ? base.trim().replace(/\/+$/, "") : "";
  return root ? `${root}/@querystring` : null;
}
function useFilterableProperties() {
  const [fetched, setFetched] = useState(void 0);
  useEffect(() => {
    const url = querystringUrl();
    if (!url) {
      setFetched(null);
      return;
    }
    let live = true;
    fetchProperties(url).then((result) => {
      if (live) setFetched(result);
    });
    return () => {
      live = false;
    };
  }, []);
  return {
    properties: [...fetched ?? [], TEXT_SEARCH_PROPERTY],
    status: fetched === void 0 ? "loading" : fetched === null ? "failed" : "ready"
  };
}
const labelClass = "w-fit cursor-default text-xs font-medium text-quanta-pigeon";
const controlClass = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground";
const noteClass = "listing-filters-widget-note text-xs font-normal text-quanta-pigeon";
const ICONS = {
  up: "M8 13V3M4 7l4-4 4 4",
  down: "M8 3v10M4 9l4 4 4-4",
  remove: "M4 4l8 8M12 4l-8 8",
  add: "M8 3v10M3 8h10"
};
function Icon({ name }) {
  return /* @__PURE__ */ jsx("svg", { viewBox: "0 0 16 16", width: "16", height: "16", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: /* @__PURE__ */ jsx("path", { d: ICONS[name] }) });
}
function storedFilters(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => typeof entry?.field === "string").map((entry) => ({
    field: entry.field,
    title: typeof entry.title === "string" ? entry.title : "",
    allowList: Array.isArray(entry.allowList) ? entry.allowList.filter((item) => typeof item === "string") : []
  }));
}
function moved(items, from, to) {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
function ItemActions({
  subject,
  index,
  count,
  onMove,
  onRemove
}) {
  return /* @__PURE__ */ jsxs("div", { className: "listing-filters-widget-actions", children: [
    /* @__PURE__ */ jsx("button", { type: "button", className: "listing-filters-widget-action", "aria-label": `Move ${subject} up`, disabled: index === 0, onClick: () => onMove(index - 1), children: /* @__PURE__ */ jsx(Icon, { name: "up" }) }),
    /* @__PURE__ */ jsx("button", { type: "button", className: "listing-filters-widget-action", "aria-label": `Move ${subject} down`, disabled: index === count - 1, onClick: () => onMove(index + 1), children: /* @__PURE__ */ jsx(Icon, { name: "down" }) }),
    /* @__PURE__ */ jsx("button", { type: "button", className: "listing-filters-widget-action listing-filters-widget-remove", "aria-label": `Remove ${subject}`, onClick: onRemove, children: /* @__PURE__ */ jsx(Icon, { name: "remove" }) })
  ] });
}
function AllowList({
  position,
  property,
  allowList,
  onChange
}) {
  const values = property?.values ?? [];
  const titles = new Map(values);
  const unchosen = values.filter(([value]) => !allowList.includes(value));
  return /* @__PURE__ */ jsxs("div", { className: "listing-filters-widget-field", children: [
    /* @__PURE__ */ jsx("span", { className: labelClass, children: "Allowed values" }),
    allowList.length ? /* @__PURE__ */ jsx("ul", { className: "listing-filters-widget-values", children: allowList.map((value, index) => {
      const title = titles.get(value) ?? value;
      return /* @__PURE__ */ jsxs("li", { className: "listing-filters-widget-value", children: [
        /* @__PURE__ */ jsx("span", { children: title }),
        /* @__PURE__ */ jsx(
          ItemActions,
          {
            subject: title,
            index,
            count: allowList.length,
            onMove: (to) => onChange(moved(allowList, index, to)),
            onRemove: () => onChange(allowList.filter((item) => item !== value))
          }
        )
      ] }, value);
    }) }) : null,
    /* @__PURE__ */ jsxs(
      "select",
      {
        "aria-label": `Add an allowed value to filter ${position}`,
        className: controlClass,
        value: "",
        disabled: !unchosen.length,
        onChange: (event) => onChange([...allowList, event.target.value]),
        children: [
          /* @__PURE__ */ jsx("option", { value: "", disabled: true, children: "Add value…" }),
          unchosen.map(([value, title]) => /* @__PURE__ */ jsx("option", { value, children: title }, value))
        ]
      }
    ),
    allowList.length ? null : /* @__PURE__ */ jsx("p", { className: noteClass, children: "With none chosen, every value found in the results is offered." })
  ] });
}
function ListingFiltersWidget(props) {
  const { label, description, className, onChange } = props;
  const widgetId = useId();
  const labelId = `${widgetId}-label`;
  const { properties, status } = useFilterableProperties();
  const filters = storedFilters(props.value ?? props.defaultValue);
  const update = (next) => onChange?.(next);
  const updateRow = (index, change) => update(filters.map((filter, i) => i === index ? { ...filter, ...change } : filter));
  const unused = properties.filter(({ field }) => !filters.some((filter) => filter.field === field));
  return /* @__PURE__ */ jsxs(
    "div",
    {
      className: `listing-filters-widget${className ? ` ${className}` : ""}`,
      role: "group",
      "aria-labelledby": label ? labelId : void 0,
      children: [
        label ? /* @__PURE__ */ jsx("span", { id: labelId, className: labelClass, children: label }) : null,
        /* @__PURE__ */ jsxs("div", { className: "listing-filters-widget-list", children: [
          filters.map((filter, index) => {
            const position = index + 1;
            const property = properties.find(({ field }) => field === filter.field);
            const filterId = `${widgetId}-${index}`;
            return /* @__PURE__ */ jsxs(
              "div",
              {
                className: "listing-filters-widget-filter",
                role: "group",
                "aria-labelledby": `${filterId}-name`,
                children: [
                  /* @__PURE__ */ jsxs("div", { className: "listing-filters-widget-head", children: [
                    /* @__PURE__ */ jsxs("span", { id: `${filterId}-name`, className: "listing-filters-widget-name", children: [
                      "Filter ",
                      position
                    ] }),
                    /* @__PURE__ */ jsx(
                      ItemActions,
                      {
                        subject: `filter ${position}`,
                        index,
                        count: filters.length,
                        onMove: (to) => update(moved(filters, index, to)),
                        onRemove: () => update(filters.filter((_filter, i) => i !== index))
                      }
                    )
                  ] }),
                  /* @__PURE__ */ jsxs("div", { className: "listing-filters-widget-field", children: [
                    /* @__PURE__ */ jsx("label", { htmlFor: `${filterId}-property`, className: labelClass, children: "Property" }),
                    /* @__PURE__ */ jsxs(
                      "select",
                      {
                        id: `${filterId}-property`,
                        "aria-label": `Filter ${position} property`,
                        className: controlClass,
                        value: filter.field,
                        onChange: (event) => updateRow(index, { field: event.target.value, allowList: [] }),
                        children: [
                          property ? null : /* @__PURE__ */ jsx("option", { value: filter.field, children: filter.field }),
                          properties.filter(({ field }) => field === filter.field || unused.some((free) => free.field === field)).map(({ field, title }) => /* @__PURE__ */ jsx("option", { value: field, children: title }, field))
                        ]
                      }
                    )
                  ] }),
                  /* @__PURE__ */ jsxs("div", { className: "listing-filters-widget-field", children: [
                    /* @__PURE__ */ jsx("label", { htmlFor: `${filterId}-title`, className: labelClass, children: "Title" }),
                    /* @__PURE__ */ jsx(
                      "input",
                      {
                        id: `${filterId}-title`,
                        type: "text",
                        "aria-label": `Filter ${position} title`,
                        className: controlClass,
                        placeholder: property?.title ?? filter.field,
                        value: filter.title,
                        onChange: (event) => updateRow(index, { title: event.target.value })
                      }
                    )
                  ] }),
                  filter.field === TEXT_SEARCH ? null : /* @__PURE__ */ jsx(
                    AllowList,
                    {
                      position,
                      property,
                      allowList: filter.allowList,
                      onChange: (allowList) => updateRow(index, { allowList })
                    }
                  )
                ]
              },
              `${filter.field}:${index}`
            );
          }),
          status === "failed" ? /* @__PURE__ */ jsx("p", { role: "status", className: noteClass, children: "The properties to filter by could not be loaded." }) : null,
          /* @__PURE__ */ jsxs(
            "button",
            {
              type: "button",
              className: "listing-filters-widget-add",
              disabled: status === "loading" || !unused.length,
              onClick: () => update([...filters, { field: unused[0].field, title: "", allowList: [] }]),
              children: [
                /* @__PURE__ */ jsx(Icon, { name: "add" }),
                "Add filter"
              ]
            }
          )
        ] }),
        description ? /* @__PURE__ */ jsx("p", { className: noteClass, children: description }) : null
      ]
    }
  );
}
function registerListingFiltersWidgets(config2) {
  config2.registerWidget({ key: "widget", definition: { listingfilters_filters: ListingFiltersWidget } });
  return config2;
}
function withFilters(upstream) {
  return (args) => {
    const schema = typeof upstream === "function" ? upstream(args) : upstream ?? {};
    if (schema.properties?.filters) return schema;
    const fieldsets = (schema.fieldsets?.length ? schema.fieldsets : [{ id: "default", title: "Default", fields: [] }]).map((fieldset) => ({
      ...fieldset,
      fields: [...fieldset.fields]
    }));
    const maximum = "querystring.limit";
    const query = fieldsets.find(({ fields }) => fields.includes(maximum)) ?? fieldsets[0];
    const at = query.fields.indexOf(maximum);
    query.fields.splice(at === -1 ? query.fields.length : at, 0, "batchSize");
    return {
      ...schema,
      fieldsets: [...fieldsets, { id: "filters", title: "Filters", fields: ["filters"] }],
      properties: {
        ...schema.properties,
        filters: { title: "Filter the results by", widget: "listingfilters_filters" },
        batchSize: {
          title: "Results per page",
          description: "Filters and the search cover every page. Maximum results still limits the whole listing.",
          placeholder: "25",
          type: "number",
          minimum: 1
        }
      }
    };
  };
}
function install(config2) {
  registerListingFiltersWidgets(config2);
  const listing = config2.blocks.blocksConfig.listing;
  if (listing) {
    config2.blocks.blocksConfig.listing = {
      ...listing,
      blockSchema: withFilters(listing.blockSchema),
      // A flag, as the host wraps the component once an install has run.
      // Aurora's own listing has no edit component, its editor shows the view.
      edit: listing.edit && !listing.filtersPreview ? withFiltersPreview(listing.edit) : listing.edit,
      filtersPreview: true
    };
  }
  return config2;
}
export {
  install as default,
  withFilters
};
//# sourceMappingURL=listing-filters.js.map
