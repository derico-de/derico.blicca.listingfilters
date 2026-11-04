const MIN_LETTERS = 3;

/** The term to search for, or null while it is too short to search yet. */
export function liveTerm(typed: string): string | null {
  const term = typed.trim();
  return term === '' || term.length >= MIN_LETTERS ? term : null;
}
