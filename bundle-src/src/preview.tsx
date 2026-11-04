import { type ComponentType, type SyntheticEvent, useEffect, useRef, useState } from 'react';

import { liveTerm } from './live-term';

const SEARCH_FIELD = '.listing-filters-search input[type=search]';
// The core preview waits another 150ms, to the 300ms of a public page.
const DELAY = 150;

type PreviewState = Record<string, unknown>;

function toggled(state: PreviewState, field: string, value: string): PreviewState {
  const { b_start: _start, ...rest } = state;
  const picked = (state[field] ?? []) as string[];
  return {
    ...rest,
    [field]: picked.includes(value) ? picked.filter((item) => item !== value) : [...picked, value],
  };
}

function searched(state: PreviewState, term: string): PreviewState {
  if ((state.SearchableText ?? '') === term) return state;
  const { b_start: _start, ...rest } = state;
  return { ...rest, SearchableText: term };
}

/** The canvas narrows like a public page, through the core block's own preview request. */
export function withFiltersPreview(CoreEdit: ComponentType<any>) {
  return function FilteredListingEdit(props: any) {
    const [state, setState] = useState<PreviewState>({});
    const container = useRef<HTMLDivElement>(null);
    const typed = useRef<string | null>(null);
    const caret = useRef<number | null>(null);
    const typing = useRef(false);
    const leftField = useRef<ReturnType<typeof setTimeout>>(undefined);
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

    useEffect(() => {
      // The core preview rewrites its HTML, the field a visitor keeps on a public page.
      const observer = new MutationObserver(() => {
        const field = container.current?.querySelector<HTMLInputElement>(SEARCH_FIELD);
        if (!field) return;
        if (typed.current !== null && field.value !== typed.current) field.value = typed.current;
        if (typing.current && field.ownerDocument.activeElement !== field) {
          field.focus({ preventScroll: true });
          field.setSelectionRange(caret.current, caret.current);
        }
      });
      observer.observe(container.current!, { childList: true, subtree: true });
      return () => {
        observer.disconnect();
        clearTimeout(timer.current);
        clearTimeout(leftField.current);
      };
    }, []);

    const search = (typedValue: string) => {
      clearTimeout(timer.current);
      const term = liveTerm(typedValue);
      if (term === null) return;
      timer.current = setTimeout(() => setState((current) => searched(current, term)), DELAY);
    };

    const onClickCapture = (event: SyntheticEvent) => {
      const link = (event.target as Element).closest<HTMLAnchorElement>('a');
      if (!link) return;
      if (link.matches('.listing-filters-reset')) {
        clearTimeout(timer.current);
        typed.current = '';
        const field = container.current?.querySelector<HTMLInputElement>(SEARCH_FIELD);
        if (field) field.value = '';
        setState({});
        return;
      }
      const start = link.dataset.listingStart;
      if (start !== undefined) {
        setState((current) => ({ ...current, b_start: Number(start) }));
        return;
      }
      const field = link.closest<HTMLElement>('[data-listing-filter]')?.dataset.listingFilter;
      const value = link.dataset.listingValue;
      if (field && value !== undefined) {
        setState((current) => toggled(current, field, value));
      }
    };

    const onInput = (event: SyntheticEvent) => {
      const field = event.target as HTMLInputElement;
      if (!field.matches(SEARCH_FIELD)) return;
      typed.current = field.value;
      caret.current = field.selectionStart;
      if (!(event.nativeEvent as InputEvent).isComposing) search(field.value);
    };

    const onSubmitCapture = (event: SyntheticEvent) => {
      event.preventDefault();
      clearTimeout(timer.current);
      const field = (event.target as Element).querySelector<HTMLInputElement>(SEARCH_FIELD);
      if (field) setState((current) => searched(current, field.value.trim()));
    };

    const onFocusCapture = (event: SyntheticEvent) => {
      if (!(event.target as Element).matches(SEARCH_FIELD)) return;
      clearTimeout(leftField.current);
      typing.current = true;
    };

    const onBlurCapture = (event: SyntheticEvent) => {
      const field = event.target as HTMLInputElement;
      if (!field.matches(SEARCH_FIELD)) return;
      caret.current = field.selectionStart;
      // Later, as the core preview's rewrite blurs the field too, and then it stays.
      leftField.current = setTimeout(() => {
        typing.current = false;
      });
    };

    const data = Object.keys(state).length ? { ...props.data, filtersPreview: state } : props.data;

    return (
      <div
        ref={container}
        onClickCapture={onClickCapture}
        onInput={onInput}
        onCompositionEnd={onInput}
        onSubmitCapture={onSubmitCapture}
        onFocusCapture={onFocusCapture}
        onBlurCapture={onBlurCapture}
      >
        <CoreEdit {...props} data={data} />
      </div>
    );
  };
}
