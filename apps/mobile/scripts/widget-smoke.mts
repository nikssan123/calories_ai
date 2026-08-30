/**
 * The iOS widget layout, compiled the way it ships and run the way it runs.
 *
 * This exists because the iOS widget is the one surface in the app that cannot
 * fail loudly. `expo-widgets` replaces the function marked `'widget'` with a
 * *string* of its own source, and the extension evaluates that string in a bare
 * JavaScriptCore context holding nothing but the `@expo/ui` components and
 * modifiers. Every free identifier is resolved there and then, against globals
 * — so a reference to anything imported, to a helper that was moved out of the
 * function, or to a name that was only ever a TypeScript type, compiles
 * cleanly, typechecks cleanly, builds cleanly, and then draws a red rectangle
 * on somebody's home screen. `tsc` cannot see it: as far as the type system is
 * concerned the import is right there at the top of the file.
 *
 * So this reproduces the trip. It runs the real Babel config to get the real
 * string, evaluates it in a context populated with exactly the names the widget
 * runtime provides and *nothing else* — an unknown identifier is a
 * `ReferenceError`, which is the whole point — and renders it with props built
 * by the real `ringProps`/`dayProps` off the real `layout.ts`.
 *
 * Then it checks the tree. A widget that renders is not yet a widget that is
 * right: `NaN` reaches SwiftUI as a silently dropped frame or an offset of
 * zero, which is how an arc ends up stacked at the centre of its own ring
 * rather than drawn around it. Every number that crosses is required to be
 * finite.
 */
import { transformFileAsync } from '@babel/core';
import { createContext, runInContext } from 'node:vm';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const problems: string[] = [];

// ---- 1. The names the extension actually has ------------------------------

const UI = path.join(root, 'node_modules/@expo/ui/build/swift-ui');

/**
 * Every runtime export of a `.d.ts` and everything it re-exports.
 *
 * The declarations are the only manifest there is — `@expo/ui` ships its
 * implementation as source, so there is no built JavaScript to ask. Types are
 * skipped on purpose: `export { type Alignment }` is not a name the widget can
 * reference, and a widget that referenced it would be exactly the bug here.
 */
function exportsOf(file: string, seen = new Set<string>()): Set<string> {
  const names = new Set<string>();
  if (seen.has(file) || !existsSync(file)) return names;
  seen.add(file);
  const source = readFileSync(file, 'utf8');

  for (const [, name] of source.matchAll(/export declare (?:const|function|class) (\w+)/g)) {
    names.add(name!);
  }
  for (const [, clause] of source.matchAll(/export \{([^}]*)\}/g)) {
    for (const entry of clause!.split(',')) {
      const piece = entry.trim();
      if (!piece || piece.startsWith('type ')) continue;
      const alias = piece.split(/\s+as\s+/).pop()!.trim();
      if (/^\w+$/.test(alias)) names.add(alias);
    }
  }
  for (const [, relative] of source.matchAll(/export \* from '([^']+)'/g)) {
    const base = path.resolve(path.dirname(file), relative!);
    for (const name of exportsOf(existsSync(`${base}.d.ts`) ? `${base}.d.ts` : path.join(base, 'index.d.ts'), seen)) {
      names.add(name);
    }
  }
  return names;
}

const components = exportsOf(path.join(UI, 'index.d.ts'));
const modifiers = exportsOf(path.join(UI, 'modifiers/index.d.ts'));
for (const name of modifiers) components.delete(name);

if (components.size < 20 || modifiers.size < 20) {
  problems.push(`only found ${components.size} components and ${modifiers.size} modifiers — the scan is wrong`);
}

// ---- 2. The layout strings, out of the real Babel pipeline -----------------

/** `expo-widgets`' own jsx stub: function types are called, children flattened. */
const jsx = (type: unknown, config: Record<string, unknown>) => {
  const props = { ...config };
  delete props.key;
  if (Array.isArray(props.children)) props.children = props.children.flat(Infinity);
  return typeof type === 'function' ? (type as (p: unknown) => unknown)(props) : { type, props };
};

const captured = new Map<string, string>();
const source = await transformFileAsync(path.join(root, 'widget/ios/Face.tsx'), {
  cwd: root,
  caller: { name: 'metro', platform: 'ios', isDev: false, supportsStaticESM: false } as never,
});

const stub = (kind: 'component' | 'modifier') =>
  new Proxy(
    {},
    {
      get: (_, name: string) =>
        kind === 'component'
          ? (props: unknown) => ({ type: name, props })
          : (...args: unknown[]) => ({ modifier: name, args }),
    },
  );

const require_ = (specifier: string) => {
  if (specifier === '@expo/ui/swift-ui') return stub('component');
  if (specifier === '@expo/ui/swift-ui/modifiers') return stub('modifier');
  /* Babel's automatic runtime imports this into every module holding JSX. It is
   * not a leak: the widget function's own JSX was rewritten to bare `_jsx`
   * before the module transform ran, and `_jsx` is one of the globals. */
  if (specifier === 'react/jsx-runtime' || specifier === 'react/jsx-dev-runtime') {
    return { jsx, jsxs: jsx, jsxDEV: jsx, Fragment: 'react.fragment' };
  }
  if (specifier === 'expo-widgets') {
    return {
      createWidget: (name: string, layout: unknown) => {
        if (typeof layout !== 'string') {
          problems.push(`${name}: createWidget got a ${typeof layout}, not a string — the 'widget' directive did not fire`);
          return {};
        }
        captured.set(name, layout);
        return {};
      },
    };
  }
  problems.push(`Face.tsx imports ${specifier}, which the widget runtime does not provide`);
  return {};
};

new Function('require', 'exports', 'module', source!.code!)(require_, {}, { exports: {} });

if (captured.size !== 2) problems.push(`expected two registered widgets, captured ${captured.size}`);

// ---- 3. Evaluate each layout with only the runtime's globals ---------------

function sandbox() {
  const globals: Record<string, unknown> = {};
  for (const name of components) globals[name] = (props: unknown) => ({ type: name, props });
  for (const name of modifiers) globals[name] = (...args: unknown[]) => ({ modifier: name, args });
  /* The rest of what `expo-widgets/bundle/index.ts` puts on `globalThis`. */
  Object.assign(globals, {
    jsx,
    jsxs: jsx,
    jsxDEV: jsx,
    _jsx: jsx,
    _jsxs: jsx,
    _jsxDEV: jsx,
    jsxProd: jsx,
    _jsxFileName: 'widget',
    Fragment: 'react.fragment',
    _Fragment: 'react.fragment',
    React: { Children: { toArray: (c: unknown) => (Array.isArray(c) ? c : [c]) } },
    Children: { toArray: (c: unknown) => (Array.isArray(c) ? c : [c]) },
    isValidElement: (v: unknown) => Boolean(v) && typeof v === 'object' && 'type' in (v as object),
    createContext: (value: unknown) => ({ Provider: 'react.provider', _currentValue: value }),
    useContext: (c: { _currentValue: unknown }) => c._currentValue,
    PlatformColor: (...names: string[]) => ({ semantic: names }),
  });
  return createContext(globals);
}

/** Every number that crosses into SwiftUI has to be a number. */
function inspect(node: unknown, where: string, seenText: string[]): void {
  if (node == null || typeof node === 'boolean') return;
  if (typeof node === 'number') {
    if (!Number.isFinite(node)) problems.push(`${where}: ${node}`);
    return;
  }
  if (typeof node === 'string') {
    seenText.push(node);
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((child, index) => inspect(child, `${where}[${index}]`, seenText));
    return;
  }
  const record = node as Record<string, unknown>;
  if (typeof record.type === 'string') {
    inspect(record.props, `${where} > ${record.type}`, seenText);
    return;
  }
  if (typeof record.modifier === 'string') {
    inspect(record.args, `${where} .${record.modifier}`, seenText);
    return;
  }
  for (const [key, value] of Object.entries(record)) inspect(value, `${where}.${key}`, seenText);
}

// ---- 4. Render every shape, both schemes, and the empty state -------------

const { ringProps, dayProps } = await import('../widget/ios/props.ts');

const day = (consumed: number, target: number, burned = 0) => ({
  localDate: '2026-08-30',
  consumed,
  target,
  burned,
  locale: 'en' as const,
  timezone: 'Europe/Sofia',
  dayStartHour: 4,
  savedAt: new Date().toISOString(),
});

/* Nothing eaten, a normal day, exactly on target, well past it, and a
 * four-figure total in a language that spaces its thousands. */
const cases = [
  ['empty', null],
  ['fresh', day(0, 2090)],
  ['partway', day(850, 2090, 320)],
  ['exact', day(2090, 2090)],
  ['over', day(2410, 2090, 120)],
  ['no target', day(400, 0)],
  ['bulgarian', { ...day(1480, 2090), locale: 'bg' as const }],
] as const;

for (const [name, layout] of captured) {
  const context = sandbox();
  let render: (props: unknown, environment: unknown) => unknown;
  try {
    render = runInContext(`(${layout})`, context) as never;
  } catch (error) {
    problems.push(`${name}: layout would not evaluate — ${(error as Error).message}`);
    continue;
  }

  for (const [label, snapshot] of cases) {
    const props = name === 'Ring' ? ringProps(snapshot) : dayProps(snapshot);
    for (const colorScheme of ['light', 'dark'] as const) {
      const where = `${name}/${label}/${colorScheme}`;
      let tree: unknown;
      try {
        tree = render(props, { colorScheme, widgetFamily: name === 'Ring' ? 'systemSmall' : 'systemMedium' });
      } catch (error) {
        problems.push(`${where}: ${(error as Error).message}`);
        continue;
      }
      const text: string[] = [];
      inspect(tree, where, text);
      if (!(tree as { type?: string })?.type) problems.push(`${where}: rendered no node`);
      if (text.some((value) => value.includes('undefined') || value.includes('NaN'))) {
        problems.push(`${where}: drew a string containing undefined or NaN`);
      }
      /* A reading that is known has to put its figure on screen; the arc alone
       * does not say what the number is. */
      if (snapshot && !text.some((value) => /\d/.test(value))) {
        problems.push(`${where}: drew no figure`);
      }
    }
  }
}

if (problems.length) {
  console.error(`${problems.length} problem(s):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(`ok — ${captured.size} layouts, ${cases.length} days, both schemes`);
