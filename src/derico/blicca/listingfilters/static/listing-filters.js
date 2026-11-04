import { jsxs, jsx } from "react/jsx-runtime";
import { useState, useEffect, useId } from "react";
import config from "@plone/registry";
const TEXT_SEARCH = "SearchableText";
const TEXT_SEARCH_PROPERTY = { field: TEXT_SEARCH, title: "Text search", values: [] };
function fromIndexes(indexes) {
  return Object.entries(indexes).filter(([, index]) => index.enabled !== false && Object.keys(index.values ?? {}).length > 0).map(([field, index]) => ({
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
const controlClass = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
const buttonClass = "rounded-md border border-input bg-background px-2 py-1 text-xs";
const noteClass = "text-xs font-normal text-quanta-pigeon";
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
function AllowList({
  position,
  property,
  allowList,
  onChange
}) {
  const values = property?.values ?? [];
  const titles = new Map(values);
  const unchosen = values.filter(([value]) => !allowList.includes(value));
  return /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-1", children: [
    /* @__PURE__ */ jsx("span", { className: labelClass, children: "Allowed values" }),
    allowList.length ? /* @__PURE__ */ jsx("ul", { className: "flex flex-col gap-1", children: allowList.map((value, index) => {
      const title = titles.get(value) ?? value;
      return /* @__PURE__ */ jsxs("li", { className: "flex items-center gap-1 text-sm", children: [
        /* @__PURE__ */ jsx("span", { className: "grow", children: title }),
        /* @__PURE__ */ jsx("button", { type: "button", className: buttonClass, "aria-label": `Move ${title} up`, disabled: index === 0, onClick: () => onChange(moved(allowList, index, index - 1)), children: "↑" }),
        /* @__PURE__ */ jsx("button", { type: "button", className: buttonClass, "aria-label": `Move ${title} down`, disabled: index === allowList.length - 1, onClick: () => onChange(moved(allowList, index, index + 1)), children: "↓" }),
        /* @__PURE__ */ jsx("button", { type: "button", className: buttonClass, "aria-label": `Remove ${title}`, onClick: () => onChange(allowList.filter((item) => item !== value)), children: "×" })
      ] }, value);
    }) }) : /* @__PURE__ */ jsx("p", { className: noteClass, children: "With none chosen, every value found in the results is offered." }),
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
    )
  ] });
}
function ListingFiltersWidget(props) {
  const { label, description, className, onChange } = props;
  const labelId = useId();
  const { properties, status } = useFilterableProperties();
  const filters = storedFilters(props.value ?? props.defaultValue);
  const update = (next) => onChange?.(next);
  const updateRow = (index, change) => update(filters.map((filter, i) => i === index ? { ...filter, ...change } : filter));
  const unused = properties.filter(({ field }) => !filters.some((filter) => filter.field === field));
  return /* @__PURE__ */ jsxs(
    "div",
    {
      className: `listing-filters-widget flex flex-col gap-1${className ? ` ${className}` : ""}`,
      role: "group",
      "aria-labelledby": label ? labelId : void 0,
      children: [
        label ? /* @__PURE__ */ jsx("span", { id: labelId, className: labelClass, children: label }) : null,
        /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-3", children: [
          filters.map((filter, index) => {
            const position = index + 1;
            const property = properties.find(({ field }) => field === filter.field);
            return /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-1", children: [
              /* @__PURE__ */ jsxs(
                "select",
                {
                  "aria-label": `Filter ${position} property`,
                  className: controlClass,
                  value: filter.field,
                  onChange: (event) => updateRow(index, { field: event.target.value, allowList: [] }),
                  children: [
                    property ? null : /* @__PURE__ */ jsx("option", { value: filter.field, children: filter.field }),
                    properties.filter(({ field }) => field === filter.field || unused.some((free) => free.field === field)).map(({ field, title }) => /* @__PURE__ */ jsx("option", { value: field, children: title }, field))
                  ]
                }
              ),
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "text",
                  "aria-label": `Filter ${position} title`,
                  className: controlClass,
                  placeholder: property?.title ?? filter.field,
                  value: filter.title,
                  onChange: (event) => updateRow(index, { title: event.target.value })
                }
              ),
              filter.field === TEXT_SEARCH ? null : /* @__PURE__ */ jsx(
                AllowList,
                {
                  position,
                  property,
                  allowList: filter.allowList,
                  onChange: (allowList) => updateRow(index, { allowList })
                }
              ),
              /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
                /* @__PURE__ */ jsx("button", { type: "button", className: buttonClass, "aria-label": `Move filter ${position} up`, disabled: index === 0, onClick: () => update(moved(filters, index, index - 1)), children: "↑" }),
                /* @__PURE__ */ jsx("button", { type: "button", className: buttonClass, "aria-label": `Move filter ${position} down`, disabled: index === filters.length - 1, onClick: () => update(moved(filters, index, index + 1)), children: "↓" }),
                /* @__PURE__ */ jsx("button", { type: "button", className: buttonClass, "aria-label": `Remove filter ${position}`, onClick: () => update(filters.filter((_filter, i) => i !== index)), children: "×" })
              ] })
            ] }, `${filter.field}:${index}`);
          }),
          status === "failed" ? /* @__PURE__ */ jsx("p", { role: "status", className: noteClass, children: "The properties to filter by could not be loaded." }) : null,
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              className: buttonClass,
              disabled: status === "loading" || !unused.length,
              onClick: () => update([...filters, { field: unused[0].field, title: "", allowList: [] }]),
              children: "Add filter"
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
    return {
      ...schema,
      fieldsets: [...schema.fieldsets ?? [], { id: "filters", title: "Filters", fields: ["filters"] }],
      properties: {
        ...schema.properties,
        filters: { title: "Filters", widget: "listingfilters_filters" }
      }
    };
  };
}
function install(config2) {
  registerListingFiltersWidgets(config2);
  const listing = config2.blocks.blocksConfig.listing;
  if (listing) {
    config2.blocks.blocksConfig.listing = { ...listing, blockSchema: withFilters(listing.blockSchema) };
  }
  return config2;
}
export {
  install as default,
  withFilters
};
//# sourceMappingURL=listing-filters.js.map
