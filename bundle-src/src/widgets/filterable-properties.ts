import config from '@plone/registry';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

export const TEXT_SEARCH = 'SearchableText';

export type FilterableProperty = {
  field: string;
  title: string;
  values: Array<[value: string, title: string]>;
};

// A criterion of the query, not a property of the content.
const NOT_A_PROPERTY = ['show_inactive'];

type QuerystringIndex = {
  title?: string;
  enabled?: boolean;
  vocabulary?: string | null;
  values?: Record<string, { title?: string }>;
};

function isFilterable(field: string, index: QuerystringIndex) {
  if (index.enabled === false || NOT_A_PROPERTY.includes(field)) return false;
  return Boolean(index.vocabulary) || Object.keys(index.values ?? {}).length > 0;
}

function fromIndexes(indexes: Record<string, QuerystringIndex>): FilterableProperty[] {
  return Object.entries(indexes)
    .filter(([field, index]) => isFilterable(field, index))
    .map(([field, index]) => ({
      field,
      title: index.title || field,
      values: Object.entries(index.values ?? {}).map(([value, term]): [string, string] => [
        value,
        term.title || value,
      ]),
    }));
}

const inflight = new Map<string, Promise<FilterableProperty[] | null>>();

function fetchProperties(url: string) {
  let pending = inflight.get(url);
  if (!pending) {
    pending = fetch(url, { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => (body?.indexes ? fromIndexes(body.indexes) : null))
      .catch(() => null);
    inflight.set(url, pending);
  }
  return pending;
}

/** Test seam: forget every cached request. */
export function resetFilterablePropertiesCache() {
  inflight.clear();
}

function querystringUrl() {
  const base = (config as { settings?: { apiPath?: unknown } }).settings?.apiPath;
  const root = typeof base === 'string' ? base.trim().replace(/\/+$/, '') : '';
  return root ? `${root}/@querystring` : null;
}

export type FilterablePropertiesState = {
  properties: FilterableProperty[];
  status: 'loading' | 'ready' | 'failed';
};

export function useFilterableProperties(): FilterablePropertiesState {
  const { t } = useTranslation();
  const [fetched, setFetched] = useState<FilterableProperty[] | null | undefined>(undefined);

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
    properties: [
      ...(fetched ?? []),
      { field: TEXT_SEARCH, title: t('listingfilters.textSearch'), values: [] },
    ],
    status: fetched === undefined ? 'loading' : fetched === null ? 'failed' : 'ready',
  };
}
