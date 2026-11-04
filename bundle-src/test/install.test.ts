import { describe, expect, it, vi } from 'vitest';

import install from '../src/index';

const coreSchema = () => ({
  title: 'Listing',
  fieldsets: [{ id: 'default', title: 'Default', fields: ['headline', 'querystring'] }],
  properties: { headline: { title: 'Headline' }, querystring: { title: 'Criteria', widget: 'querystring' } },
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
    expect(schema.properties.filters.widget).toBe('listingfilters_filters');
    expect(schema.properties.querystring.widget).toBe('querystring');
  });

  it('keeps the core block otherwise', () => {
    const listing = install(hostConfig()).blocks.blocksConfig.listing;

    expect(listing.view).toBe(CoreView);
    expect(listing.edit).toBe(CoreEdit);
    expect(listing.icon).toBe('icon');
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
