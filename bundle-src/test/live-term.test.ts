import { describe, expect, it } from 'vitest';

import { liveTerm } from '../src/live-term';

describe('liveTerm', () => {
  it.each(['a', 'ab', ' ab '])('waits for more of %j', (typed) => {
    expect(liveTerm(typed)).toBeNull();
  });

  it.each([
    ['abc', 'abc'],
    [' abc ', 'abc'],
    ['abcd', 'abcd'],
  ])('searches for %j', (typed, term) => {
    expect(liveTerm(typed)).toBe(term);
  });

  it.each(['', '   '])('clears the search with %j', (typed) => {
    expect(liveTerm(typed)).toBe('');
  });
});
