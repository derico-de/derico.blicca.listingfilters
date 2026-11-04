import { ListingFiltersWidget } from './ListingFiltersWidget';

type WidgetRegistrar = {
  registerWidget: (options: { key: string; definition: unknown }) => void;
};

export function registerListingFiltersWidgets<T extends WidgetRegistrar>(config: T): T {
  config.registerWidget({ key: 'widget', definition: { listingfilters_filters: ListingFiltersWidget } });
  return config;
}
