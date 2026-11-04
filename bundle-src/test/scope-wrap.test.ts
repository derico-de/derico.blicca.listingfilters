/**
 * The scope-wrap plugin is copied verbatim from collective.fragmentsblock
 * and is load-bearing for ADR 0006: it is what makes one stylesheet dress
 * both surfaces and still beat an unlayered Barceloneta rule. Its transform
 * is a pure function, so it is tested directly rather than through a build.
 */
import { describe, expect, it } from 'vitest';
import { transformCss } from '../build-plugins/scope-wrap';

const options = {
  scopeRoots: ['.aurora-editor', '.aurora-editor-portal', '.aurora-blocks-view'],
  scopeLimit: '.aurora-pattern-island',
};

describe('transformCss', () => {
  it('wraps rules in the donut scope the contract fixes', () => {
    const out = transformCss('.promo { color: red; }', options);
    expect(out).toContain(
      '@scope (.aurora-editor, .aurora-editor-portal, .aurora-blocks-view) to (.aurora-pattern-island)',
    );
    expect(out).toContain('.promo');
  });

  it('flattens @layer, which would otherwise lose to unlayered Barceloneta', () => {
    const out = transformCss('@layer cmsui { .promo { color: red; } }', options);
    expect(out).not.toContain('@layer');
    expect(out).toContain('.promo');
  });

  it('rewrites :root to :where(:scope) so seam tokens survive the wrap', () => {
    const out = transformCss(':root { --promo-x: 1px; }', options);
    expect(out).toContain(':where(:scope)');
    expect(out).not.toMatch(/(^|[\s>+~,(]):root/);
  });

  it('hoists @font-face out of the scope, where names are global', () => {
    const out = transformCss(
      '@font-face { font-family: X; } .promo { color: red; }',
      options,
    );
    expect(out.indexOf('@font-face')).toBeLessThan(out.indexOf('@scope'));
  });
});
