/**
 * English that reaches a screen without going through a catalogue.
 *
 *   pnpm literals
 *
 * The third of the language checks, and the one the other two cannot be.
 * `pnpm -r typecheck` proves every catalogue has every key; `pnpm messages`
 * proves every message runs. Neither can see a sentence that never went near a
 * catalogue at all — and by the second string pass (LANGUAGES.md) there were
 * over two hundred of those, in every language, from toasts to screen-reader
 * labels.
 *
 * It parses every .ts/.tsx under both apps and fails on:
 *
 * - JSX text with words in it;
 * - a string or template literal given to an attribute a reader or a screen
 *   reader sees — `title`, `placeholder`, `aria-label`, `accessibilityLabel`
 *   and the rest of `ATTRS`;
 * - a literal rendered straight into JSX, through a ternary or `&&` included;
 * - text handed to a toast, an `Alert`, or a message setter.
 *
 * It is a heuristic and says so. A word assembled inside a helper and returned —
 * a swipe row's label, an undo button — is invisible to it, which is where the
 * second pass found its last few by reading. Units and brands are in `NOISE`.
 *
 * The deliberate English is `EXCLUDED`, each for a reason written down
 * elsewhere: the landing page and legal text (LANGUAGES.md, "What does not get
 * translated"), the coach dashboard (COACH.md §12), the admin panel, the UI
 * primitives, and the catalogues themselves.
 */
const { createRequire } = require('module');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ts = createRequire(path.join(ROOT, 'apps/web/package.json'))('typescript');

const DIRS = [
  'apps/web/app',
  'apps/web/components',
  'apps/web/lib',
  'apps/mobile/app',
  'apps/mobile/components',
  'apps/mobile/hooks',
  'apps/mobile/lib',
  'apps/mobile/widget',
];
const EXCLUDED =
  /\/(admin|privacy|terms|support|about|how-it-works|accuracy|messages|scripts|ui|coach|landing)\/|\/cook\/library\/page\.tsx$|LegalPage|Placeholder\.tsx$|\.test\.|\.d\.ts$/;
const ATTRS = new Set([
  'title',
  'placeholder',
  'aria-label',
  'alt',
  'label',
  'accessibilityLabel',
  'accessibilityHint',
  'subtitle',
  'description',
  'heading',
  'hint',
  'caption',
  'confirmLabel',
  'cancelLabel',
  'body',
  'message',
  'emptyLabel',
  'cta',
  'footer',
]);
const CALLS = /^(toast(\.\w+)?|Alert\.alert|setError|setMessage|setSent|setNotice|setStatus|notify|announce)$/;
const NOISE =
  /^(kcal|g|kg|ml|lb|oz|cm|ft|in|min|h|AM|PM|OK|XXXX-XXXX|Day So Far|Plus|Coach|Free|Google|Apple|GitHub)$/;

function wordy(raw) {
  const text = raw
    .replace(/\$\{[^}]*\}/g, ' ')
    .replace(/^[`'"]|[`'"]$/g, '')
    .trim();
  return (
    /[A-Za-z]{2,}/.test(text) &&
    /[a-z]/.test(text) &&
    !NOISE.test(text) &&
    !/^[a-z0-9_./:-]+$/.test(text) && // a key, a path, a route
    !/^[a-z]+([A-Z][a-z]+)+$/.test(text) // an identifier
  );
}

const files = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!/node_modules|\.next/.test(entry.name)) walk(full);
    } else if (/\.tsx?$/.test(entry.name)) files.push(full);
  }
};
DIRS.forEach((dir) => walk(path.join(ROOT, dir)));

const found = [];
for (const file of files) {
  const rel = path.relative(ROOT, file);
  if (EXCLUDED.test(`/${rel}`)) continue;
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const report = (node, kind, text) => {
    const { line } = source.getLineAndCharacterOfPosition(node.getStart());
    found.push(`${rel}:${line + 1} ${kind}: ${text.replace(/\s+/g, ' ').trim().slice(0, 100)}`);
  };
  const visit = (node) => {
    if (ts.isJsxText(node)) {
      const text = node.getText().trim();
      if (text && wordy(text)) report(node, 'text', text);
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) {
      let parent = node.parent;
      while (
        parent &&
        (ts.isConditionalExpression(parent) || ts.isBinaryExpression(parent) || ts.isParenthesizedExpression(parent))
      ) {
        parent = parent.parent;
      }
      const text = node.getText();
      if (parent && ts.isJsxExpression(parent)) {
        const host = parent.parent;
        if ((ts.isJsxElement(host) || ts.isJsxFragment(host)) && wordy(text)) report(node, 'jsx', text);
        else if (host && ts.isJsxAttribute(host) && ATTRS.has(host.name.getText()) && wordy(text)) {
          report(node, host.name.getText(), text);
        }
      } else if (parent && ts.isJsxAttribute(parent) && ATTRS.has(parent.name.getText()) && wordy(text)) {
        report(node, parent.name.getText(), text);
      } else if (
        parent &&
        ts.isCallExpression(parent) &&
        CALLS.test(parent.expression.getText()) &&
        parent.arguments.includes(node) &&
        wordy(text)
      ) {
        report(node, `${parent.expression.getText()}()`, text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

if (found.length) {
  console.error(found.join('\n'));
  console.error(`\n${found.length} untranslated literal(s). Route each through the catalogue, or exclude it with a reason.`);
  process.exit(1);
}
console.log(`no untranslated literals in ${files.length} files`);
