import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useEffect, useMemo, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withFiltersPreview } from '../src/preview';

const previews: unknown[] = [];

function markup(state: any) {
  const term = state?.SearchableText ?? '';
  return `
    <form class="listing-filters-search" action="#">
      <input type="search" aria-label="Search" value="${term}" />
      <button type="submit">Search</button>
    </form>
    <ul data-listing-filter="Subject">
      <li><a href="#" data-listing-value="news">News</a></li>
      <li><a href="#" data-listing-value="press">Press</a></li>
    </ul>
    <a href="#" class="listing-filters-reset">Reset</a>
    <nav class="listing-pager"><a href="#" rel="next" data-listing-start="2">Next</a></nav>
    <a href="/somewhere">A result</a>
  `;
}

/** As the core block does: every preview replaces the HTML. */
function CoreEdit({ data }: any) {
  const [html, setHtml] = useState(() => markup(undefined));
  useEffect(() => {
    previews.push(data.filtersPreview);
    setHtml(markup(data.filtersPreview));
  }, [JSON.stringify(data)]);
  const inner = useMemo(() => ({ __html: html }), [html]);
  return <div dangerouslySetInnerHTML={inner} />;
}

const Edit = withFiltersPreview(CoreEdit);
const onChangeBlock = vi.fn();

const field = () => screen.getByRole<HTMLInputElement>('searchbox');
const last = () => previews.at(-1);

const typeIn = (value: string) => {
  fireEvent.input(field(), { target: { value } });
};
const wait = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

beforeEach(() => {
  vi.useFakeTimers();
  previews.length = 0;
  onChangeBlock.mockClear();
  render(<Edit data={{ filters: [] }} block="b" onChangeBlock={onChangeBlock} />);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('options', () => {
  it('narrow the preview, and a second click undoes it', () => {
    fireEvent.click(screen.getByText('News'));
    expect(last()).toEqual({ Subject: ['news'] });

    fireEvent.click(screen.getByText('Press'));
    expect(last()).toEqual({ Subject: ['news', 'press'] });

    fireEvent.click(screen.getByText('News'));
    expect(last()).toEqual({ Subject: ['press'] });
  });

  it('go back to the first page', () => {
    fireEvent.click(screen.getByText('Next'));
    expect(last()).toEqual({ b_start: 2 });

    fireEvent.click(screen.getByText('News'));
    expect(last()).toEqual({ Subject: ['news'] });
  });
});

describe('the search', () => {
  it('waits for the third letter', async () => {
    const before = previews.length;
    typeIn('ab');
    await wait(1000);
    expect(previews.length).toBe(before);

    typeIn('abc');
    await wait(150);
    expect(last()).toEqual({ SearchableText: 'abc' });
  });

  it('searches at once with Enter, even for one letter', () => {
    typeIn('a');
    fireEvent.submit(field().form!);
    expect(last()).toEqual({ SearchableText: 'a' });
  });

  it('brings everything back when emptied', async () => {
    typeIn('abc');
    await wait(150);
    typeIn('');
    await wait(150);
    expect(last()).toEqual({ SearchableText: '' });
  });

  it('goes back to the first page', async () => {
    fireEvent.click(screen.getByText('Next'));
    typeIn('abc');
    await wait(150);
    expect(last()).toEqual({ SearchableText: 'abc' });
  });

  it('keeps what was typed since, its focus and caret', async () => {
    field().focus();
    typeIn('abc');
    await wait(100);
    typeIn('abcd');
    field().setSelectionRange(4, 4);
    fireEvent.input(field());
    fireEvent.submit(field().form!);
    typeIn('abcde');
    field().setSelectionRange(2, 2);
    fireEvent.input(field());

    await wait(0);
    expect(field().value).toBe('abcde');
    expect(document.activeElement).toBe(field());
    expect(field().selectionStart).toBe(2);
  });

  it('does not take the focus back from elsewhere', async () => {
    const elsewhere = document.createElement('button');
    document.body.append(elsewhere);
    field().focus();
    typeIn('abc');
    elsewhere.focus();
    await wait(150);

    expect(document.activeElement).toBe(elsewhere);
    elsewhere.remove();
  });
});

describe('the pager', () => {
  it('turns the page within the selection', () => {
    fireEvent.click(screen.getByText('News'));
    fireEvent.click(screen.getByText('Next'));
    expect(last()).toEqual({ Subject: ['news'], b_start: 2 });
  });
});

describe('reset', () => {
  it('clears the state, the field and a search waiting to go out', async () => {
    fireEvent.click(screen.getByText('News'));
    typeIn('abc');
    fireEvent.click(screen.getByText('Reset'));
    await wait(1000);

    expect(last()).toBeUndefined();
    expect(field().value).toBe('');
  });
});

describe('the block', () => {
  it('passes no state before anything narrows it', () => {
    expect(previews).toEqual([undefined]);
  });

  it('never stores the preview', async () => {
    fireEvent.click(screen.getByText('News'));
    typeIn('abc');
    await wait(150);
    expect(onChangeBlock).not.toHaveBeenCalled();
  });

  it('ignores other links', () => {
    fireEvent.click(screen.getByText('A result'));
    expect(previews).toEqual([undefined]);
  });
});
