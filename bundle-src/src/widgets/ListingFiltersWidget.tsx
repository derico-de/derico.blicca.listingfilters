/**
 * `listingfilters_filters`: an ordered list of `{field, title, allowList}`
 * rows, the shape the Python view reads. The renderer never passes an `id`,
 * so each control names itself.
 */
import { useId } from 'react';

import {
  TEXT_SEARCH,
  useFilterableProperties,
  type FilterableProperty,
} from './filterable-properties';

export type Filter = { field: string; title: string; allowList: string[] };

export type ListingFiltersWidgetProps = {
  label?: string;
  description?: string;
  className?: string;
  value?: unknown;
  defaultValue?: unknown;
  onChange?: (value: Filter[]) => void;
};

const labelClass = 'w-fit cursor-default text-xs font-medium text-quanta-pigeon';
const controlClass = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground';
const buttonClass = 'rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground';
const noteClass = 'text-xs font-normal text-quanta-pigeon';

function storedFilters(value: unknown): Filter[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry) => typeof entry?.field === 'string')
    .map((entry) => ({
      field: entry.field,
      title: typeof entry.title === 'string' ? entry.title : '',
      allowList: Array.isArray(entry.allowList)
        ? entry.allowList.filter((item: unknown): item is string => typeof item === 'string')
        : [],
    }));
}

function moved<T>(items: T[], from: number, to: number): T[] {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function AllowList({
  position,
  property,
  allowList,
  onChange,
}: {
  position: number;
  property?: FilterableProperty;
  allowList: string[];
  onChange: (allowList: string[]) => void;
}) {
  const values = property?.values ?? [];
  const titles = new Map(values);
  const unchosen = values.filter(([value]) => !allowList.includes(value));
  return (
    <div className="flex flex-col gap-1">
      <span className={labelClass}>Allowed values</span>
      {allowList.length ? (
        <ul className="flex flex-col gap-1">
          {allowList.map((value, index) => {
            const title = titles.get(value) ?? value;
            return (
              <li key={value} className="flex items-center gap-1 text-sm">
                <span className="grow">{title}</span>
                <button type="button" className={buttonClass} aria-label={`Move ${title} up`} disabled={index === 0} onClick={() => onChange(moved(allowList, index, index - 1))}>
                  ↑
                </button>
                <button type="button" className={buttonClass} aria-label={`Move ${title} down`} disabled={index === allowList.length - 1} onClick={() => onChange(moved(allowList, index, index + 1))}>
                  ↓
                </button>
                <button type="button" className={buttonClass} aria-label={`Remove ${title}`} onClick={() => onChange(allowList.filter((item) => item !== value))}>
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={noteClass}>With none chosen, every value found in the results is offered.</p>
      )}
      <select
        aria-label={`Add an allowed value to filter ${position}`}
        className={controlClass}
        value=""
        disabled={!unchosen.length}
        onChange={(event) => onChange([...allowList, event.target.value])}
      >
        <option value="" disabled>
          Add value…
        </option>
        {unchosen.map(([value, title]) => (
          <option key={value} value={value}>
            {title}
          </option>
        ))}
      </select>
    </div>
  );
}

export function ListingFiltersWidget(props: ListingFiltersWidgetProps) {
  const { label, description, className, onChange } = props;
  const labelId = useId();
  const { properties, status } = useFilterableProperties();
  const filters = storedFilters(props.value ?? props.defaultValue);

  const update = (next: Filter[]) => onChange?.(next);
  const updateRow = (index: number, change: Partial<Filter>) =>
    update(filters.map((filter, i) => (i === index ? { ...filter, ...change } : filter)));
  const unused = properties.filter(({ field }) => !filters.some((filter) => filter.field === field));

  return (
    <div
      className={`listing-filters-widget flex flex-col gap-1${className ? ` ${className}` : ''}`}
      role="group"
      aria-labelledby={label ? labelId : undefined}
    >
      {label ? (
        <span id={labelId} className={labelClass}>
          {label}
        </span>
      ) : null}
      <div className="flex flex-col gap-3">
        {filters.map((filter, index) => {
          const position = index + 1;
          const property = properties.find(({ field }) => field === filter.field);
          return (
            <div key={`${filter.field}:${index}`} className="flex flex-col gap-1">
              <select
                aria-label={`Filter ${position} property`}
                className={controlClass}
                value={filter.field}
                onChange={(event) => updateRow(index, { field: event.target.value, allowList: [] })}
              >
                {property ? null : <option value={filter.field}>{filter.field}</option>}
                {properties
                  .filter(({ field }) => field === filter.field || unused.some((free) => free.field === field))
                  .map(({ field, title }) => (
                    <option key={field} value={field}>
                      {title}
                    </option>
                  ))}
              </select>
              <input
                type="text"
                aria-label={`Filter ${position} title`}
                className={controlClass}
                placeholder={property?.title ?? filter.field}
                value={filter.title}
                onChange={(event) => updateRow(index, { title: event.target.value })}
              />
              {filter.field === TEXT_SEARCH ? null : (
                <AllowList
                  position={position}
                  property={property}
                  allowList={filter.allowList}
                  onChange={(allowList) => updateRow(index, { allowList })}
                />
              )}
              <div className="flex items-center gap-2">
                <button type="button" className={buttonClass} aria-label={`Move filter ${position} up`} disabled={index === 0} onClick={() => update(moved(filters, index, index - 1))}>
                  ↑
                </button>
                <button type="button" className={buttonClass} aria-label={`Move filter ${position} down`} disabled={index === filters.length - 1} onClick={() => update(moved(filters, index, index + 1))}>
                  ↓
                </button>
                <button type="button" className={buttonClass} aria-label={`Remove filter ${position}`} onClick={() => update(filters.filter((_filter, i) => i !== index))}>
                  ×
                </button>
              </div>
            </div>
          );
        })}
        {status === 'failed' ? (
          <p role="status" className={noteClass}>
            The properties to filter by could not be loaded.
          </p>
        ) : null}
        <button
          type="button"
          className={buttonClass}
          disabled={status === 'loading' || !unused.length}
          onClick={() => update([...filters, { field: unused[0].field, title: '', allowList: [] }])}
        >
          Add filter
        </button>
      </div>
      {description ? <p className={noteClass}>{description}</p> : null}
    </div>
  );
}

export default ListingFiltersWidget;
