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

// The field faces are the host's classes. The layout around them is this
// add-on's own, in styles.css under `.listing-filters-widget`.
const labelClass = 'w-fit cursor-default text-xs font-medium text-quanta-pigeon';
const controlClass = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground';
const noteClass = 'listing-filters-widget-note text-xs font-normal text-quanta-pigeon';

const ICONS = {
  up: 'M8 13V3M4 7l4-4 4 4',
  down: 'M8 3v10M4 9l4 4 4-4',
  remove: 'M4 4l8 8M12 4l-8 8',
  add: 'M8 3v10M3 8h10',
};

function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

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

function ItemActions({
  subject,
  index,
  count,
  onMove,
  onRemove,
}: {
  subject: string;
  index: number;
  count: number;
  onMove: (to: number) => void;
  onRemove: () => void;
}) {
  return (
    <div className="listing-filters-widget-actions">
      <button type="button" className="listing-filters-widget-action" aria-label={`Move ${subject} up`} disabled={index === 0} onClick={() => onMove(index - 1)}>
        <Icon name="up" />
      </button>
      <button type="button" className="listing-filters-widget-action" aria-label={`Move ${subject} down`} disabled={index === count - 1} onClick={() => onMove(index + 1)}>
        <Icon name="down" />
      </button>
      <button type="button" className="listing-filters-widget-action listing-filters-widget-remove" aria-label={`Remove ${subject}`} onClick={onRemove}>
        <Icon name="remove" />
      </button>
    </div>
  );
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
    <div className="listing-filters-widget-field">
      <span className={labelClass}>Allowed values</span>
      {allowList.length ? (
        <ul className="listing-filters-widget-values">
          {allowList.map((value, index) => {
            const title = titles.get(value) ?? value;
            return (
              <li key={value} className="listing-filters-widget-value">
                <span>{title}</span>
                <ItemActions
                  subject={title}
                  index={index}
                  count={allowList.length}
                  onMove={(to) => onChange(moved(allowList, index, to))}
                  onRemove={() => onChange(allowList.filter((item) => item !== value))}
                />
              </li>
            );
          })}
        </ul>
      ) : null}
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
      {allowList.length ? null : (
        <p className={noteClass}>With none chosen, every value found in the results is offered.</p>
      )}
    </div>
  );
}

export function ListingFiltersWidget(props: ListingFiltersWidgetProps) {
  const { label, description, className, onChange } = props;
  const widgetId = useId();
  const labelId = `${widgetId}-label`;
  const { properties, status } = useFilterableProperties();
  const filters = storedFilters(props.value ?? props.defaultValue);

  const update = (next: Filter[]) => onChange?.(next);
  const updateRow = (index: number, change: Partial<Filter>) =>
    update(filters.map((filter, i) => (i === index ? { ...filter, ...change } : filter)));
  const unused = properties.filter(({ field }) => !filters.some((filter) => filter.field === field));

  return (
    <div
      className={`listing-filters-widget${className ? ` ${className}` : ''}`}
      role="group"
      aria-labelledby={label ? labelId : undefined}
    >
      {label ? (
        <span id={labelId} className={labelClass}>
          {label}
        </span>
      ) : null}
      <div className="listing-filters-widget-list">
        {filters.map((filter, index) => {
          const position = index + 1;
          const property = properties.find(({ field }) => field === filter.field);
          const filterId = `${widgetId}-${index}`;
          return (
            <div
              key={`${filter.field}:${index}`}
              className="listing-filters-widget-filter"
              role="group"
              aria-labelledby={`${filterId}-name`}
            >
              <div className="listing-filters-widget-head">
                <span id={`${filterId}-name`} className="listing-filters-widget-name">
                  Filter {position}
                </span>
                <ItemActions
                  subject={`filter ${position}`}
                  index={index}
                  count={filters.length}
                  onMove={(to) => update(moved(filters, index, to))}
                  onRemove={() => update(filters.filter((_filter, i) => i !== index))}
                />
              </div>
              <div className="listing-filters-widget-field">
                <label htmlFor={`${filterId}-property`} className={labelClass}>
                  Property
                </label>
                <select
                  id={`${filterId}-property`}
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
              </div>
              <div className="listing-filters-widget-field">
                <label htmlFor={`${filterId}-title`} className={labelClass}>
                  Title
                </label>
                <input
                  id={`${filterId}-title`}
                  type="text"
                  aria-label={`Filter ${position} title`}
                  className={controlClass}
                  placeholder={property?.title ?? filter.field}
                  value={filter.title}
                  onChange={(event) => updateRow(index, { title: event.target.value })}
                />
              </div>
              {filter.field === TEXT_SEARCH ? null : (
                <AllowList
                  position={position}
                  property={property}
                  allowList={filter.allowList}
                  onChange={(allowList) => updateRow(index, { allowList })}
                />
              )}
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
          className="listing-filters-widget-add"
          disabled={status === 'loading' || !unused.length}
          onClick={() => update([...filters, { field: unused[0].field, title: '', allowList: [] }])}
        >
          <Icon name="add" />
          Add filter
        </button>
      </div>
      {description ? <p className={noteClass}>{description}</p> : null}
    </div>
  );
}

export default ListingFiltersWidget;
