import { withFiltersPreview } from './preview';
import { registerListingFiltersWidgets } from './widgets';
import './styles.css';

type Schema = {
  fieldsets?: Array<{ id: string; title: string; fields: string[] }>;
  properties?: Record<string, unknown>;
};

/** The core schema with a Filters fieldset below its own settings. */
export function withFilters(upstream: unknown) {
  return (args?: unknown): Schema => {
    const schema: Schema =
      typeof upstream === 'function' ? upstream(args) : ((upstream ?? {}) as Schema);
    if (schema.properties?.filters) return schema;
    return {
      ...schema,
      fieldsets: [...(schema.fieldsets ?? []), { id: 'filters', title: 'Filters', fields: ['filters'] }],
      properties: {
        ...schema.properties,
        filters: { title: 'Filter the results by', widget: 'listingfilters_filters' },
      },
    };
  };
}

// Called once per registry record, so it has to stay idempotent.
export default function install(config: any) {
  registerListingFiltersWidgets(config);
  const listing = config.blocks.blocksConfig.listing;
  if (listing) {
    config.blocks.blocksConfig.listing = {
      ...listing,
      blockSchema: withFilters(listing.blockSchema),
      // A flag, as the host wraps the component once an install has run.
      // Aurora's own listing has no edit component, its editor shows the view.
      edit: listing.edit && !listing.filtersPreview ? withFiltersPreview(listing.edit) : listing.edit,
      filtersPreview: true,
    };
  }
  return config;
}
