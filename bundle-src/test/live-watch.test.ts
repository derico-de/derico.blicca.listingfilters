import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { watchListings } from '../src/live/watch';

const PAGE = `
  <div class="listing">
    <div class="listing-filters" id="listing-a" data-listing-block="a">
      <form class="listing-filters-search pat-inject" action="/page">
        <input type="search" name="a.SearchableText" value="" />
        <div hidden>
          <input type="hidden" name="a.Subject" value="news" />
          <input type="hidden" name="b.Subject" value="old" />
        </div>
      </form>
      <div id="listing-a-filter-Subject">
        <ul data-listing-filter="Subject">
          <li><a class="pat-inject" data-listing-value="news" href="/page?a.Subject=news">News</a></li>
          <li><a class="pat-inject" data-listing-value="press" href="/page?a.Subject=press">Press</a></li>
        </ul>
      </div>
      <div id="listing-a-reset"><a class="listing-filters-reset pat-inject" href="/page">Reset</a></div>
    </div>
    <div class="listing-results" id="listing-a-results" data-listing-block="a">
      <nav class="listing-pager"><a class="pat-inject" rel="next" href="/page?a.b_start=2">Next</a></nav>
    </div>
  </div>
`;

const field = () => document.querySelector<HTMLInputElement>('input[type=search]')!;
const form = () => field().form!;
const option = (value: string) =>
  document.querySelector<HTMLAnchorElement>(`a[data-listing-value="${value}"]`)!;

function type(value: string) {
  field().value = value;
  field().dispatchEvent(new Event('input', { bubbles: true }));
}

function click(link: HTMLElement, init: MouseEventInit = {}) {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, ...init });
  const reached = vi.fn((e: Event) => e.preventDefault());
  link.addEventListener('click', reached);
  link.dispatchEvent(event);
  return reached;
}

/** What pat-inject does to a region. */
function swap(id: string, html: string) {
  const template = document.createElement('template');
  template.innerHTML = html;
  document.getElementById(id)!.replaceWith(template.content);
}

beforeAll(() => watchListings(document));

let submit: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = PAGE;
  window.history.replaceState({}, '', '/page');
  submit = vi.fn();
  form().requestSubmit = submit as any;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the live search', () => {
  it('waits for the third letter', () => {
    type('ab');
    vi.advanceTimersByTime(1000);
    expect(submit).not.toHaveBeenCalled();

    type('abc');
    vi.advanceTimersByTime(299);
    expect(submit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(submit).toHaveBeenCalledOnce();
  });

  it('searches once for quick typing', () => {
    type('abc');
    vi.advanceTimersByTime(100);
    type('abcd');
    vi.advanceTimersByTime(300);
    expect(submit).toHaveBeenCalledOnce();
  });

  it('brings everything back when emptied', () => {
    type('abc');
    vi.advanceTimersByTime(300);
    form().dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    submit.mockClear();

    type('');
    vi.advanceTimersByTime(300);
    expect(submit).toHaveBeenCalledOnce();
  });

  it('does not search again for what it just sent', () => {
    type('abc');
    form().dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    vi.advanceTimersByTime(300);
    expect(submit).not.toHaveBeenCalled();

    type('abc ');
    vi.advanceTimersByTime(300);
    expect(submit).not.toHaveBeenCalled();
  });

  it('does not search for the term already on the page', () => {
    field().defaultValue = 'abc';
    type('abc');
    vi.advanceTimersByTime(300);
    expect(submit).not.toHaveBeenCalled();
  });

  it('holds on while a search is in flight', () => {
    form().classList.add('executing');
    type('abc');
    vi.advanceTimersByTime(1000);
    expect(submit).not.toHaveBeenCalled();

    form().classList.remove('executing');
    vi.advanceTimersByTime(300);
    expect(submit).toHaveBeenCalledOnce();
  });

  it('waits out an input method composing a word', () => {
    field().value = 'abc';
    field().dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
    vi.advanceTimersByTime(1000);
    expect(submit).not.toHaveBeenCalled();

    field().dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    vi.advanceTimersByTime(300);
    expect(submit).toHaveBeenCalledOnce();
  });

  it('leaves a form pat-inject does not handle alone', () => {
    form().classList.remove('pat-inject');
    type('abc');
    vi.advanceTimersByTime(300);
    expect(submit).not.toHaveBeenCalled();
  });
});

describe('reset', () => {
  it('empties the field and drops the search waiting to go out', () => {
    type('abc');
    click(document.querySelector<HTMLElement>('.listing-filters-reset')!);
    vi.advanceTimersByTime(300);

    expect(field().value).toBe('');
    expect(submit).not.toHaveBeenCalled();
  });
});

describe('another listing on the page', () => {
  it('leaves pat-inject the link while its URL holds', () => {
    window.history.replaceState({}, '', '/page?a.Subject=news');
    expect(click(option('press'))).toHaveBeenCalled();
    expect(option('press').getAttribute('href')).toBe('/page?a.Subject=press');
  });

  it('loads a link that lost another listing’s selection in full', () => {
    window.history.replaceState({}, '', '/page?b.Subject=fresh');
    const reached = click(option('press'));

    expect(reached).not.toHaveBeenCalled();
    const url = new URL(option('press').href);
    expect(url.searchParams.get('b.Subject')).toBe('fresh');
    expect(url.searchParams.get('a.Subject')).toBe('press');
  });

  it('sends another listing’s current selection with the search', () => {
    window.history.replaceState({}, '', '/page?b.Subject=fresh&c.Subject=too');
    form().dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    expect([...new FormData(form()).entries()]).toEqual([
      ['a.SearchableText', ''],
      ['a.Subject', 'news'],
      ['b.Subject', 'fresh'],
      ['c.Subject', 'too'],
    ]);
  });
});

describe('a link in a new tab', () => {
  it.each(['ctrlKey', 'metaKey', 'shiftKey', 'altKey'])('stays a link with %s', (key) => {
    expect(click(option('news'), { [key]: true })).not.toHaveBeenCalled();
  });
});

describe('the keyboard focus', () => {
  const settled = async () => {
    await vi.advanceTimersByTimeAsync(0);
  };

  it('stays on the same option', async () => {
    option('press').focus();
    click(option('press'));
    swap(
      'listing-a-filter-Subject',
      `<div id="listing-a-filter-Subject"><ul data-listing-filter="Subject">
        <li><a class="pat-inject" data-listing-value="press" href="#">Press</a></li>
      </ul></div>`,
    );
    await settled();
    expect(document.activeElement).toBe(option('press'));
  });

  it('moves to the rest of the pager on its last page', async () => {
    const next = document.querySelector<HTMLElement>('a[rel=next]')!;
    next.focus();
    click(next);
    swap(
      'listing-a-results',
      `<div id="listing-a-results" data-listing-block="a">
        <nav class="listing-pager"><a class="pat-inject" rel="prev" href="#">Previous</a></nav>
      </div>`,
    );
    await settled();
    expect(document.activeElement).toBe(document.querySelector('a[rel=prev]'));
  });

  it('falls back to the filters when its link is gone', async () => {
    const reset = document.querySelector<HTMLElement>('.listing-filters-reset')!;
    reset.focus();
    click(reset);
    swap('listing-a-reset', '<div id="listing-a-reset" hidden></div>');
    await settled();
    expect(document.activeElement).toBe(document.getElementById('listing-a'));
  });

  it('leaves it where a visitor moved it meanwhile', async () => {
    option('press').focus();
    click(option('press'));
    field().focus();
    swap('listing-a-filter-Subject', '<div id="listing-a-filter-Subject"></div>');
    await settled();
    expect(document.activeElement).toBe(field());
  });
});
