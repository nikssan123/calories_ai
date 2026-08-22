/**
 * Markdown, cut down to what belongs in a chat bubble.
 *
 * The model writes markdown whether or not it was asked to — a **bold** lead-in
 * on a weekly summary, a short list of what it just logged — and the journal
 * printed the asterisks. This is the parser behind <Markdown>: source in, a
 * small tree out. It never produces a string of HTML, so nothing here can hand
 * markup to `dangerouslySetInnerHTML`, and a reply cannot smuggle a tag into
 * the page however it is worded.
 *
 * It is deliberately not a CommonMark implementation. It covers what a reply in
 * a conversation actually contains — emphasis, code, links, lists, headings,
 * the occasional table — and leaves out everything that either never appears in
 * two sentences or has nowhere to sit on a phone: reference links, footnotes,
 * images, raw HTML, setext headings.
 *
 * Half-written input is the normal case rather than an edge one: this runs on
 * every frame of a streamed reply, so it is handed the first half of a sentence
 * tens of times a second. An unpaired marker stays literal text until its
 * partner arrives, which is the only behaviour that never shows a shape the
 * finished reply turns out not to have.
 */

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; children: Inline[] }
  | { kind: 'em'; children: Inline[] }
  | { kind: 'strike'; children: Inline[] }
  | { kind: 'code'; text: string }
  | { kind: 'link'; href: string; children: Inline[] };

export type Align = 'left' | 'center' | 'right';

export type Block =
  | { kind: 'paragraph'; content: Inline[] }
  | { kind: 'heading'; level: number; content: Inline[] }
  | { kind: 'list'; ordered: boolean; start: number; items: Block[][] }
  | { kind: 'quote'; children: Block[] }
  | { kind: 'code'; text: string }
  | { kind: 'table'; head: Inline[][]; rows: Inline[][][]; align: Align[] }
  | { kind: 'rule' };

const HEADING = /^ {0,3}(#{1,6})[ \t]+(.*?)[ \t]*#*$/;
const RULE = /^ {0,3}([-*_])[ \t]*(?:\1[ \t]*){2,}$/;
const FENCE = /^ {0,3}(```|~~~)/;
const QUOTE = /^ {0,3}> ?(.*)$/;
const BULLET = /^( *)([-*+])[ \t]+(.*)$/;
const ORDERED = /^( *)(\d{1,9})[.)][ \t]+(.*)$/;

/** The whole entry point: a reply as it stands right now, as blocks. */
export function parseBlocks(src: string): Block[] {
  return blocksFrom(src.replace(/\r\n?/g, '\n').split('\n'));
}

function blocksFrom(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    if (!line.trim()) {
      i += 1;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const marker = fence[1]!;
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i]!.trimStart().startsWith(marker)) {
        body.push(lines[i]!);
        i += 1;
      }
      // Past the closing fence — or past the end, when the reply is still being
      // written and the fence it opened has not been closed yet.
      i += 1;
      blocks.push({ kind: 'code', text: body.join('\n') });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ kind: 'heading', level: heading[1]!.length, content: parseInline(heading[2]!) });
      i += 1;
      continue;
    }

    if (RULE.test(line)) {
      blocks.push({ kind: 'rule' });
      i += 1;
      continue;
    }

    if (opensTable(lines, i)) {
      const align = alignments(lines[i + 1]!);
      const head = splitRow(line).map(parseInline);
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && lines[i]!.includes('|') && lines[i]!.trim()) {
        rows.push(splitRow(lines[i]!).map(parseInline));
        i += 1;
      }
      blocks.push({ kind: 'table', head, rows, align });
      continue;
    }

    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (i < lines.length && lines[i]!.trim()) {
        const quoted = QUOTE.exec(lines[i]!);
        body.push(quoted ? quoted[1]! : lines[i]!);
        i += 1;
      }
      blocks.push({ kind: 'quote', children: blocksFrom(body) });
      continue;
    }

    if (BULLET.test(line) || ORDERED.test(line)) {
      const [list, next] = parseList(lines, i);
      blocks.push(list);
      i = next;
      continue;
    }

    const body: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !opensBlock(lines, i)) {
      body.push(lines[i]!);
      i += 1;
    }
    // The line this started on opens no other block, so the paragraph always
    // takes at least one line and the loop always moves.
    blocks.push({ kind: 'paragraph', content: parseInline(body.join('\n')) });
  }

  return blocks;
}

/** Whether this line ends the paragraph running into it by starting something. */
function opensBlock(lines: string[], at: number): boolean {
  const line = lines[at]!;
  return (
    HEADING.test(line) ||
    RULE.test(line) ||
    FENCE.test(line) ||
    QUOTE.test(line) ||
    BULLET.test(line) ||
    ORDERED.test(line) ||
    opensTable(lines, at)
  );
}

/**
 * A list, and one level of markdown's indentation rules.
 *
 * Everything indented under an item belongs to it, which is what makes a nested
 * list work without a second code path: the indented lines are collected, the
 * indent is stripped, and the whole item goes back through the block parser —
 * so a sub-list is a list inside a list item, and a two-paragraph item is two
 * paragraphs.
 */
function parseList(lines: string[], from: number): [Block, number] {
  const ordered = ORDERED.test(lines[from]!);
  const matcher = ordered ? ORDERED : BULLET;
  const items: Block[][] = [];
  let start = 1;
  let i = from;

  while (i < lines.length) {
    // A blank line between two items keeps the list together rather than
    // starting a second one beneath it.
    if (!lines[i]!.trim() && i + 1 < lines.length && matcher.test(lines[i + 1]!)) {
      i += 1;
      continue;
    }

    const item = matcher.exec(lines[i]!);
    if (!item) break;
    if (ordered && items.length === 0) start = Number(item[2]);

    const indent = item[1]!.length + 2;
    const body = [item[3]!];
    i += 1;

    while (i < lines.length) {
      const next = lines[i]!;
      if (!next.trim()) {
        // A blank line only stays inside the item if the item goes on after it.
        const after = lines[i + 1];
        if (after === undefined || !after.trim() || leadingSpaces(after) < indent) break;
        body.push('');
        i += 1;
        continue;
      }
      // Indented under the marker, or a plain wrapped line — markdown counts
      // both as part of the item. A sibling marker at this level does not
      // qualify, so it ends the item and starts the next one.
      if (leadingSpaces(next) >= indent) {
        body.push(next.slice(indent));
        i += 1;
        continue;
      }
      if (matcher.test(next) || opensBlock(lines, i)) break;
      body.push(next.trim());
      i += 1;
    }

    items.push(blocksFrom(body));
  }

  return [{ kind: 'list', ordered, start, items }, i];
}

function leadingSpaces(line: string): number {
  return line.length - line.trimStart().length;
}

/** A header row is only a header row once the dashes under it say so. */
function opensTable(lines: string[], at: number): boolean {
  const header = lines[at]!;
  const under = lines[at + 1];
  if (!header.includes('|') || under === undefined || !under.includes('|')) return false;
  const cells = splitRow(under);
  return cells.length > 1 && cells.every((cell) => /^:?-+:?$/.test(cell));
}

function alignments(delimiter: string): Align[] {
  return splitRow(delimiter).map((cell) => {
    if (cell.startsWith(':') && cell.endsWith(':')) return 'center';
    if (cell.endsWith(':')) return 'right';
    return 'left';
  });
}

function splitRow(line: string): string[] {
  const inner = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells: string[] = [];
  let cell = '';
  for (let i = 0; i < inner.length; i += 1) {
    if (inner[i] === '\\' && inner[i + 1] === '|') {
      cell += '|';
      i += 1;
      continue;
    }
    if (inner[i] === '|') {
      cells.push(cell.trim());
      cell = '';
      continue;
    }
    cell += inner[i];
  }
  cells.push(cell.trim());
  return cells;
}

const ESCAPABLE = /[\\`*_{}[\]()#+\-.!~>|]/;
const LINK = /^\[((?:[^\][\\]|\\.)*)\]\([ \t]*<?([^\s<>()]*)>?(?:[ \t]+"[^"]*")?[ \t]*\)/;
const BARE_URL = /^(?:https?:\/\/|www\.)[^\s<>]+/i;

/** One run of text, scanned left to right. Recurses for whatever nests. */
export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let plain = '';
  const flush = () => {
    if (plain) {
      out.push({ kind: 'text', text: plain });
      plain = '';
    }
  };

  let i = 0;
  while (i < src.length) {
    const c = src[i]!;

    if (c === '\\' && ESCAPABLE.test(src[i + 1] ?? '')) {
      plain += src[i + 1];
      i += 2;
      continue;
    }

    if (c === '`') {
      const run = runLength(src, i, '`');
      const close = src.indexOf('`'.repeat(run), i + run);
      if (close > i + run) {
        flush();
        out.push({ kind: 'code', text: src.slice(i + run, close).replace(/^ | $/g, '') });
        i = close + run;
        continue;
      }
    }

    if (c === '~' && src[i + 1] === '~') {
      const end = findClose(src, i + 2, '~', 2);
      if (end > 0) {
        flush();
        out.push({ kind: 'strike', children: parseInline(src.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }

    if (c === '*' || c === '_') {
      const emphasised = emphasis(src, i, c);
      if (emphasised) {
        flush();
        out.push(emphasised.node);
        i = emphasised.next;
        continue;
      }
    }

    if (c === '[') {
      const link = LINK.exec(src.slice(i));
      if (link) {
        const href = safeHref(link[2]!);
        const children = parseInline(link[1]!);
        flush();
        // A link we will not follow still says something; the words stay, the
        // tap goes away.
        if (href) out.push({ kind: 'link', href, children });
        else out.push(...children);
        i += link[0]!.length;
        continue;
      }
    }

    if ((c === 'h' || c === 'H' || c === 'w' || c === 'W') && !isWordChar(src[i - 1] ?? '')) {
      const bare = BARE_URL.exec(src.slice(i));
      if (bare) {
        // Trailing punctuation belongs to the sentence, not to the address.
        const url = bare[0]!.replace(/[.,;:!?'"）)\]}]+$/, '');
        const href = safeHref(url);
        if (href) {
          flush();
          out.push({ kind: 'link', href, children: [{ kind: 'text', text: url }] });
          i += url.length;
          continue;
        }
      }
    }

    plain += c;
    i += 1;
  }

  flush();
  return out;
}

/**
 * Emphasis, by the two rules that matter and none of the rest.
 *
 * A marker only opens when a non-space follows it and only closes when a
 * non-space precedes it — that is what keeps "2 * 3 * 4" arithmetic. And an
 * underscore inside a word never opens at all, so `kcal_per_day` survives being
 * said out loud.
 */
function emphasis(src: string, at: number, ch: string): { node: Inline; next: number } | null {
  const run = Math.min(3, runLength(src, at, ch));
  const start = at + run;
  const first = src[start];
  if (first === undefined || /\s/.test(first)) return null;
  if (ch === '_' && isWordChar(src[at - 1] ?? '')) return null;

  const end = findClose(src, start, ch, run);
  if (end < 0) return null;
  if (ch === '_' && isWordChar(src[end + run] ?? '')) return null;

  const children = parseInline(src.slice(start, end));
  const node: Inline =
    run === 1
      ? { kind: 'em', children }
      : run === 2
        ? { kind: 'strong', children }
        : { kind: 'strong', children: [{ kind: 'em', children }] };
  return { node, next: end + run };
}

/**
 * The matching marker, skipping runs that belong to somebody else.
 *
 * A single asterisk looking for its pair steps over every `**` on the way, so
 * the inner bold in "*a **b** c*" closes its own pair rather than the italic's.
 */
function findClose(src: string, from: number, ch: string, len: number): number {
  let i = from;
  while (i < src.length) {
    const at = src.indexOf(ch, i);
    if (at < 0) return -1;
    const run = runLength(src, at, ch);
    const closes = len === 1 ? run === 1 : run >= len;
    if (at > from && closes && !/\s/.test(src[at - 1]!)) return at;
    i = at + run;
  }
  return -1;
}

function runLength(src: string, at: number, ch: string): number {
  let n = 0;
  while (src[at + n] === ch) n += 1;
  return n;
}

function isWordChar(ch: string): boolean {
  return /[0-9A-Za-z_]/.test(ch);
}

/**
 * Where a link is allowed to go.
 *
 * The text behind this is written by a model, and a model can be talked into
 * writing anything — so the scheme is allow-listed rather than sniffed for the
 * dangerous ones. `javascript:`, `data:` and everything else nobody thought of
 * fall through to null and render as plain words.
 */
function safeHref(raw: string): string | null {
  const href = raw.trim();
  if (!href) return null;
  if (/^https?:\/\//i.test(href)) return href;
  if (/^mailto:[^\s]+@/i.test(href)) return href;
  if (/^www\./i.test(href)) return `https://${href}`;
  if (/^[/#]/.test(href)) return href;
  return null;
}
