import { describe, expect, it, vi } from 'vitest';

import install from '../src/index';

const coreSchema = () => ({
  title: 'Listing',
  fieldsets: [{ id: 'default', title: 'Default', fields: ['headline', 'querystring', 'querystring.limit'] }],
  properties: {
    headline: { title: 'Headline' },
    querystring: { title: 'Criteria', widget: 'querystring', showLimit: false },
    'querystring.limit': { title: 'Maximum results', type: 'number' },
  },
  required: [],
});

const CoreView = () => null;
const CoreEdit = () => null;

function hostConfig(blockSchema: unknown = coreSchema) {
  return {
    registerWidget: vi.fn(),
    blocks: {
      blocksConfig: {
        listing: { id: 'listing', title: 'Listing', view: CoreView, edit: CoreEdit, icon: 'icon', blockSchema },
      } as Record<string, any>,
    },
  };
}

describe('install', () => {
  it('adds a Filters fieldset below the core settings', () => {
    const config = install(hostConfig());
    const schema = config.blocks.blocksConfig.listing.blockSchema({ formData: {} });

    expect(schema.fieldsets.map((fieldset: any) => fieldset.id)).toEqual(['default', 'filters']);
    expect(schema.fieldsets[1].fields).toEqual(['filters']);
    expect(schema.fieldsets[0].fields).toEqual(['headline', 'querystring', 'batchSize', 'querystring.limit']);
    expect(schema.properties.filters.widget).toBe('listingfilters_filters');
    expect(schema.properties.querystring.widget).toBe('querystring');
  });

  it('asks for a number of results per page', () => {
    const schema = install(hostConfig()).blocks.blocksConfig.listing.blockSchema({ formData: {} });

    expect(schema.properties.batchSize).toMatchObject({ title: 'Results per page', type: 'number', minimum: 1 });
  });

  it('keeps results per page when the core schema has no fieldsets', () => {
    const schema = install(hostConfig({ ...coreSchema(), fieldsets: [] }))
      .blocks.blocksConfig.listing.blockSchema({ formData: {} });

    expect(schema.fieldsets.map((fieldset: any) => fieldset.id)).toEqual(['default', 'filters']);
    expect(schema.fieldsets[0].fields).toEqual(['batchSize']);
    expect(schema.fieldsets[1].fields).toEqual(['filters']);
  });

  it('inserts results per page directly before the maximum in its fieldset', () => {
    const shared = coreSchema();
    shared.fieldsets = [
      { id: 'default', title: 'Default', fields: ['headline', 'querystring'] },
      { id: 'paging', title: 'Paging', fields: ['querystring.limit'] },
    ];
    const schema = install(hostConfig(shared)).blocks.blocksConfig.listing.blockSchema({});

    expect(schema.fieldsets[0].fields).toEqual(['headline', 'querystring']);
    expect(schema.fieldsets[1].fields).toEqual(['batchSize', 'querystring.limit']);
    expect(shared.fieldsets[1].fields).toEqual(['querystring.limit']);
  });

  it('keeps the core block otherwise', () => {
    const listing = install(hostConfig()).blocks.blocksConfig.listing;

    expect(listing.view).toBe(CoreView);
    expect(listing.icon).toBe('icon');
  });

  it('wraps the canvas once when installed twice', () => {
    const once = install(hostConfig()).blocks.blocksConfig.listing.edit;
    const config = hostConfig();
    install(config);
    const first = config.blocks.blocksConfig.listing.edit;

    install(config);

    expect(once).not.toBe(CoreEdit);
    expect(config.blocks.blocksConfig.listing.edit).toBe(first);
  });

  it('leaves a host whose listing has no edit component on its view', () => {
    const config = hostConfig();
    delete config.blocks.blocksConfig.listing.edit;

    const { listing } = install(config).blocks.blocksConfig;

    expect(listing.edit).toBeUndefined();
    expect(listing.view).toBe(CoreView);
  });

  it('passes the arguments on to the core schema', () => {
    const blockSchema = vi.fn(coreSchema);
    const args = { formData: { headline: 'News' } };

    install(hostConfig(blockSchema)).blocks.blocksConfig.listing.blockSchema(args);

    expect(blockSchema).toHaveBeenCalledWith(args);
  });

  it('does not change a core schema given as an object', () => {
    const shared = coreSchema();

    const schema = install(hostConfig(shared)).blocks.blocksConfig.listing.blockSchema({});

    expect(schema.fieldsets).toHaveLength(2);
    expect(shared.fieldsets).toHaveLength(1);
    expect(shared.fieldsets[0].fields).toEqual(['headline', 'querystring', 'querystring.limit']);
    expect(shared.properties).not.toHaveProperty('filters');
  });

  it('adds the fieldset once when installed twice', () => {
    const config = install(install(hostConfig()));

    const schema = config.blocks.blocksConfig.listing.blockSchema({});

    expect(schema.fieldsets.map((fieldset: any) => fieldset.id)).toEqual(['default', 'filters']);
  });

  it('registers its widget under a namespaced key', () => {
    const config = hostConfig();

    install(config);

    const [{ key, definition }] = config.registerWidget.mock.calls[0];
    expect(key).toBe('widget');
    expect(Object.keys(definition)).toEqual(['listingfilters_filters']);
  });

  it('leaves a host without a listing block alone', () => {
    const config = { registerWidget: vi.fn(), blocks: { blocksConfig: {} as Record<string, any> } };

    expect(install(config).blocks.blocksConfig).toEqual({});
  });
});
