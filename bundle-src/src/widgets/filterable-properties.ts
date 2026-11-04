import config from '@plone/registry';
import { useEffect, useState } from 'react';

export const TEXT_SEARCH = 'SearchableText';

export type FilterableProperty = {
  field: string;
  title: string;
  values: Array<[value: string, title: string]>;
};

const TEXT_SEARCH_PROPERTY: FilterableProperty = { field: TEXT_SEARCH, title: 'Text search', values: [] };

type QuerystringIndex = {
  title?: string;
  enabled?: boolean;
  values?: Record<string, { title?: string }>;
};

function fromIndexes(indexes: Record<string, QuerystringIndex>): FilterableProperty[] {
  return Object.entries(indexes)
    .filter(([, index]) => index.enabled !== false && Object.keys(index.values ?? {}).length > 0)
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
    properties: [...(fetched ?? []), TEXT_SEARCH_PROPERTY],
    status: fetched === undefined ? 'loading' : fetched === null ? 'failed' : 'ready',
  };
}
