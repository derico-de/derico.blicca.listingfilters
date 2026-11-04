/**
 * ADR 0006 (as corrected during implementation): post-process every emitted
 * CSS asset so the editor styles two-way-isolate against Barceloneta.
 *
 * 1. Flatten all @layer blocks in place (preserving source order) and drop
 *    @layer order statements. Cascade layers LOSE to unlayered author CSS,
 *    and Barceloneta ships unlayered — keeping the editor CSS inside
 *    @layer cmsui would let every Barceloneta element rule win. Aurora puts
 *    tailwind theme/preflight/utilities into the single cmsui layer in
 *    source order, so flattening is semantics-preserving internally.
 * 2. Hoist name-global at-rules (@font-face, @keyframes, @property,
 *    @charset, @import) out of the scope wrap.
 * 3. Rewrite :root/html/body selector components to :where(:scope) — a
 *    :root token rule inside @scope can never match (the document root is
 *    outside the scope), so every design token would silently vanish. Each
 *    scope root re-establishes them (this is what carries the tokens into
 *    the portal roots).
 * 4. Wrap the remainder in
 *    @scope (<roots>) to (<limit>) — the donut limit keeps the preflight
 *    reset away from the embedded mockup-pattern islands. At equal
 *    specificity a scoped declaration beats an unscoped one (scope
 *    proximity), which is what wins the editor-vs-Barceloneta contest.
 */
import postcss, { AtRule, type ChildNode } from 'postcss';
import type { Plugin } from 'vite';

export type ScopeWrapOptions = {
  scopeRoots: string[];
  scopeLimit: string;
};

const HOISTED_AT_RULES = new Set([
  'font-face',
  'keyframes',
  'property',
  'charset',
  'import',
]);

// A bare :root/html/body selector component (not tbody, .body, [body], …).
const ROOT_SELECTOR_RE = /(^|[\s>+~,(])(?::root|html|body)(?![-\w])/g;

export function transformCss(css: string, options: ScopeWrapOptions): string {
  const root = postcss.parse(css);

  // 1. Flatten @layer recursively; replaceWith() re-inserts children that
  // may themselves be @layer blocks, so loop until none remain.
  for (;;) {
    let found = false;
    root.walkAtRules('layer', (atRule) => {
      found = true;
      if (atRule.nodes?.length) {
        atRule.replaceWith(...atRule.nodes);
      } else {
        atRule.remove();
      }
    });
    if (!found) break;
  }

  // 2. Hoist name-global at-rules.
  const hoisted: ChildNode[] = [];
  root.walkAtRules((atRule) => {
    if (HOISTED_AT_RULES.has(atRule.name)) {
      hoisted.push(atRule.clone());
      atRule.remove();
    }
  });

  // 3. Rewrite document-root selectors to the scope root.
  root.walkRules((rule) => {
    if (rule.parent?.type === 'atrule') {
      const name = (rule.parent as AtRule).name;
      if (HOISTED_AT_RULES.has(name)) return;
    }
    rule.selectors = rule.selectors.map((selector) =>
      selector.replace(ROOT_SELECTOR_RE, '$1:where(:scope)'),
    );
  });

  // 4. Wrap in @scope.
  const scopeRule = postcss.atRule({
    name: 'scope',
    params: `(${options.scopeRoots.join(', ')}) to (${options.scopeLimit})`,
  });
  scopeRule.append(...root.nodes);

  const output = postcss.root();
  output.append(...hoisted);
  output.append(scopeRule);
  return output.toString();
}

export function scopeWrap(options: ScopeWrapOptions): Plugin {
  return {
    name: 'blicca-scope-wrap',
    apply: 'build',
    generateBundle(_outputOptions, bundle) {
      for (const [fileName, output] of Object.entries(bundle)) {
        if (output.type === 'asset' && fileName.endsWith('.css')) {
          output.source = transformCss(String(output.source), options);
        }
      }
    },
  };
}
