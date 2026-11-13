import config from '@plone/registry';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetFilterablePropertiesCache } from '../src/widgets/filterable-properties';
import { ListingFiltersWidget } from '../src/widgets/ListingFiltersWidget';

const QUERYSTRING = {
  indexes: {
    path: { title: 'Location', values: {}, enabled: true },
    Subject: {
      title: 'Tag',
      enabled: true,
      values: { News: { title: 'News' }, Events: { title: 'Events' }, Press: { title: 'Press' } },
    },
    portal_type: {
      title: 'Type',
      enabled: true,
      values: { Document: { title: 'Page' }, 'News Item': { title: 'News item' } },
    },
    Creator: { title: 'Creator', enabled: true, values: {}, vocabulary: 'plone.app.vocabularies.Users' },
    review_state: { title: 'State', enabled: false, values: { published: { title: 'Published' } } },
    show_inactive: { title: 'Show Inactive', enabled: true, values: { Manager: { title: 'Manager' } } },
  },
};

function stubFetch(response: unknown = QUERYSTRING, ok = true) {
  const fetchMock = vi.fn(async () => ({ ok, json: async () => response }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function Harness({ initial, onChange }: { initial?: unknown; onChange?: (value: unknown) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <ListingFiltersWidget
      label="Filters"
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

async function renderWidget(initial?: unknown) {
  const onChange = vi.fn();
  render(<Harness initial={initial} onChange={onChange} />);
  await act(() => new Promise((settled) => setTimeout(settled)));
  const add = screen.getByRole('button', { name: 'Add filter' });
  return { add, onChange, stored: () => onChange.mock.lastCall?.[0] };
}

const optionLabels = (select: HTMLElement) =>
  within(select).getAllByRole('option').map((option) => option.textContent);

beforeEach(() => {
  (config as any).settings = { apiPath: 'http://site.test/Plone1/' };
  resetFilterablePropertiesCache();
  stubFetch();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the properties a filter can use', () => {
  it('asks the site root for them', async () => {
    const fetchMock = stubFetch();

    await renderWidget();

    expect(fetchMock).toHaveBeenCalledWith(
      'http://site.test/Plone1/@querystring',
      expect.objectContaining({ credentials: 'same-origin' }),
    );
  });

  it('offers enabled properties with values or a vocabulary, and the text search', async () => {
    const { add } = await renderWidget();

    fireEvent.click(add);

    expect(optionLabels(screen.getByRole('combobox', { name: 'Filter 1 property' }))).toEqual([
      'Tag',
      'Type',
      'Creator',
      'Text search',
    ]);
  });

  it('asks once for every widget on the page', async () => {
    const fetchMock = stubFetch();

    await renderWidget();
    render(<Harness />);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('still offers the text search when they fail to load', async () => {
    stubFetch({}, false);
    const { add } = await renderWidget();

    expect(screen.getByRole('status').textContent).toContain('could not be loaded');
    fireEvent.click(add);

    expect(optionLabels(screen.getByRole('combobox', { name: 'Filter 1 property' }))).toEqual(['Text search']);
  });

  it('keeps a stored property it no longer knows', async () => {
    await renderWidget([{ field: 'gone', title: '', allowList: [] }]);

    expect(screen.getByRole('combobox', { name: 'Filter 1 property' })).toHaveProperty('value', 'gone');
  });
});

describe('the filter rows', () => {
  it('labels the title field so its placeholder does not read as a value', async () => {
    await renderWidget([{ field: 'Subject', title: '', allowList: [] }]);

    const label = screen.getByText('Title');
    const field = screen.getByRole('textbox', { name: 'Filter 1 title' });
    expect(label.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('labels the property field', async () => {
    await renderWidget([{ field: 'Subject', title: '', allowList: [] }]);

    const label = screen.getByText('Property') as HTMLLabelElement;
    expect(label.htmlFor).toBe(screen.getByRole('combobox', { name: 'Filter 1 property' }).id);
  });

  it('frames each filter as a group of its own fields and actions', async () => {
    await renderWidget([
      { field: 'Subject', title: '', allowList: ['News'] },
      { field: 'SearchableText', title: '', allowList: [] },
    ]);

    const first = within(screen.getByRole('group', { name: 'Filter 1' }));
    const second = within(screen.getByRole('group', { name: 'Filter 2' }));
    expect(first.getByRole('combobox', { name: 'Filter 1 property' })).toBeTruthy();
    expect(first.getByRole('button', { name: 'Remove filter 1' })).toBeTruthy();
    expect(first.getByRole('button', { name: 'Remove News' })).toBeTruthy();
    expect(first.queryByRole('textbox', { name: 'Filter 2 title' })).toBeNull();
    expect(second.getByRole('textbox', { name: 'Filter 2 title' })).toBeTruthy();
    expect(second.getByRole('button', { name: 'Move filter 2 up' })).toBeTruthy();
  });

  it('heads a filter with its actions, before its fields', async () => {
    await renderWidget([{ field: 'Subject', title: '', allowList: [] }]);

    const remove = screen.getByRole('button', { name: 'Remove filter 1' });
    const property = screen.getByRole('combobox', { name: 'Filter 1 property' });
    expect(remove.compareDocumentPosition(property) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('adds a filter on the first unused property', async () => {
    const { add, stored } = await renderWidget([{ field: 'Subject', title: '', allowList: [] }]);

    fireEvent.click(add);

    expect(stored()).toEqual([
      { field: 'Subject', title: '', allowList: [] },
      { field: 'portal_type', title: '', allowList: [] },
    ]);
  });

  it('cannot add a filter once every property has one', async () => {
    const { add } = await renderWidget([
      { field: 'Subject', title: '', allowList: [] },
      { field: 'portal_type', title: '', allowList: [] },
      { field: 'Creator', title: '', allowList: [] },
      { field: 'SearchableText', title: '', allowList: [] },
    ]);

    expect(add).toHaveProperty('disabled', true);
  });

  it('does not offer a property another filter uses', async () => {
    await renderWidget([
      { field: 'Subject', title: '', allowList: [] },
      { field: 'portal_type', title: '', allowList: [] },
    ]);

    expect(optionLabels(screen.getByRole('combobox', { name: 'Filter 2 property' }))).toEqual([
      'Type',
      'Creator',
      'Text search',
    ]);
  });

  it('drops the allow list when the property changes', async () => {
    const { stored } = await renderWidget([{ field: 'Subject', title: 'Topic', allowList: ['News'] }]);

    fireEvent.change(screen.getByRole('combobox', { name: 'Filter 1 property' }), {
      target: { value: 'portal_type' },
    });

    expect(stored()).toEqual([{ field: 'portal_type', title: 'Topic', allowList: [] }]);
  });

  it('stores the title and shows the property title until then', async () => {
    const { stored } = await renderWidget([{ field: 'Subject', title: '', allowList: [] }]);
    const title = screen.getByRole('textbox', { name: 'Filter 1 title' });

    expect(title).toHaveProperty('placeholder', 'Tag');
    fireEvent.change(title, { target: { value: 'Topic' } });

    expect(stored()).toEqual([{ field: 'Subject', title: 'Topic', allowList: [] }]);
  });

  it('moves and removes filters', async () => {
    const { stored } = await renderWidget([
      { field: 'Subject', title: '', allowList: [] },
      { field: 'portal_type', title: '', allowList: [] },
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Move filter 2 up' }));
    expect(stored().map((filter: any) => filter.field)).toEqual(['portal_type', 'Subject']);

    fireEvent.click(screen.getByRole('button', { name: 'Remove filter 1' }));
    expect(stored().map((filter: any) => filter.field)).toEqual(['Subject']);
  });

  it('labels the group of filters', async () => {
    await renderWidget();

    expect(screen.getByRole('group', { name: 'Filters' })).toBeTruthy();
  });
});

describe('the allow list', () => {
  const tagFilter = (allowList: string[]) => [{ field: 'Subject', title: '', allowList }];

  it('adds a value from all the values of the site', async () => {
    const { stored } = await renderWidget(tagFilter(['Press']));
    const add = screen.getByRole('combobox', { name: 'Add an allowed value to filter 1' });

    expect(optionLabels(add)).toEqual(['Add value…', 'News', 'Events']);
    fireEvent.change(add, { target: { value: 'News' } });

    expect(stored()[0].allowList).toEqual(['Press', 'News']);
  });

  it('sets the order of the values', async () => {
    const { stored } = await renderWidget(tagFilter(['News', 'Press']));

    fireEvent.click(screen.getByRole('button', { name: 'Move Press up' }));

    expect(stored()[0].allowList).toEqual(['Press', 'News']);
  });

  it('removes a value', async () => {
    const { stored } = await renderWidget(tagFilter(['News', 'Press']));

    fireEvent.click(screen.getByRole('button', { name: 'Remove News' }));

    expect(stored()[0].allowList).toEqual(['Press']);
  });

  it('shows a value by its title, and a stale value as stored', async () => {
    await renderWidget([{ field: 'portal_type', title: '', allowList: ['News Item', 'Gone'] }]);

    const values = screen.getAllByRole('listitem').map((item) => item.querySelector('span')?.textContent);
    expect(values).toEqual(['News item', 'Gone']);
  });

  it('explains an empty list below the field that fills it', async () => {
    await renderWidget(tagFilter([]));

    const add = screen.getByRole('combobox', { name: 'Add an allowed value to filter 1' });
    const note = screen.getByText(/With none chosen/);
    expect(add.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('does not apply to the text search', async () => {
    await renderWidget([{ field: 'SearchableText', title: '', allowList: [] }]);

    expect(screen.queryByRole('combobox', { name: 'Add an allowed value to filter 1' })).toBeNull();
  });
});
