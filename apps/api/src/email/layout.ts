/**
 * The house style for everything this server sends.
 *
 * Email is not the web. There is no cascade to rely on, no external stylesheet,
 * no flexbox worth the risk, and the same message renders in a dozen engines
 * that disagree about all three. So this module owns the markup and every
 * template above it describes *content* — a heading and a list of blocks — and
 * never writes a `<td>`. When a client turns out to need a workaround, it is
 * fixed once, here, rather than in seven templates.
 *
 * The rules the markup follows:
 *
 * - Tables for layout, inline styles for anything that must survive. Gmail
 *   strips `<style>` in some contexts, so the light palette is inlined and the
 *   dark palette is layered on top in a `<style>` block. A client that drops it
 *   still shows a correct light email rather than black text on black.
 * - Every message carries a plain-text alternative built from the same blocks.
 *   It is what filters read, what a watch shows, and what someone piping mail
 *   through a terminal gets — generating it from the same source is the only
 *   way it stays true as templates change.
 * - Nothing is loaded from the network. No images, no fonts, no tracking pixel:
 *   the mark is drawn with a border-radius and a letter, so the message looks
 *   the same with remote content blocked, which is how most people read it.
 */

/** Warm paper and ink, matching the app's own light theme. */
const PALETTE = {
  ground: '#f2f0ec',
  card: '#ffffff',
  ink: '#171614',
  muted: '#6b6862',
  hairline: '#e6e2dc',
  accent: '#0f7b5c',
  accentInk: '#ffffff',
  tint: '#f0f7f4',
};

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

export type Block =
  /** A paragraph. The workhorse. */
  | { kind: 'text'; text: string }
  /** The one thing the message wants done. At most one per email. */
  | { kind: 'button'; label: string; url: string }
  /** Label/value rows — sign-in details, what a deletion removed. */
  | { kind: 'facts'; items: Array<{ label: string; value: string }> }
  /**
   * Numbers worth reading at a glance — two to a row, each in its own cell.
   *
   * Deliberately a grid rather than a strip: four figures shared across 520
   * points give each one about a word's width, and the first thing to break is
   * the number, which wraps under its own thousands separator. Two columns
   * survive a phone without the media query having to stack them into four
   * full-width rows nobody scrolls past.
   */
  | { kind: 'stats'; items: Array<{ label: string; value: string; hint?: string }> }
  /**
   * A week, as seven cells. The one picture in the whole system.
   *
   * `tone` is the state, not a colour, so the palette stays this module's
   * business: `hit` is a day that landed on target, `logged` a day that was
   * written down, `missing` one that was not.
   */
  | {
      kind: 'week';
      days: Array<{ label: string; value: string | null; tone: 'hit' | 'logged' | 'missing' }>;
      caption?: string;
    }
  /** A section label — small, upper, and the only thing that breaks the page up. */
  | { kind: 'subhead'; text: string }
  /** One thing worth boxing off: a title and a sentence, in the accent tint. */
  | { kind: 'callout'; title: string; text: string }
  /** A hairline. Nothing else in a mail client separates two sections honestly. */
  | { kind: 'rule' }
  /**
   * Someone else's words, set off by a rule down the side.
   *
   * Unused at the time of writing — the weekly review used to arrive quoted and
   * now leads with its numbers instead — but kept because the *next* message
   * that carries something the product did not write will want it, and this is
   * the one place that knows how to draw a quote in seven mail engines.
   */
  | { kind: 'quote'; text: string }
  /** Small print attached to the block above it. */
  | { kind: 'note'; text: string }
  /** A short code, sized to be read off one screen and typed into another. */
  | { kind: 'code'; value: string };

export interface EmailContent {
  /** The subject, reused as the document title. */
  subject: string;
  /**
   * The line an inbox shows after the subject. Without one, clients scrape the
   * top of the body and show "View this email in your browser" or the heading
   * twice, which is a wasted second chance to say what the message is.
   */
  preheader: string;
  heading: string;
  /**
   * The line under the heading — a date range, a period, the thing that says
   * *which* week or month this one is about. Sits in the heading's own block
   * rather than arriving as a first paragraph, because it is a label on the
   * title and reads as one.
   */
  subheading?: string;
  blocks: Block[];
  /** Present only on mail someone is allowed to stop receiving. */
  unsubscribeUrl?: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function renderEmail(content: EmailContent): RenderedEmail {
  return {
    subject: content.subject,
    html: renderHtml(content),
    text: renderText(content),
  };
}

// ---- HTML ------------------------------------------------------------------

function renderHtml(content: EmailContent): string {
  const blocks = content.blocks.map(htmlBlock).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<!-- Tells a client the message has both palettes, so it renders ours rather
     than inverting the light one itself and inventing its own contrast. -->
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(content.subject)}</title>
<style>
  /* Only ever an override of the inline light palette; nothing here is load
     bearing, because plenty of clients will never run it. */
  @media (prefers-color-scheme: dark) {
    .ct-ground { background-color: #100f0e !important; }
    .ct-card   { background-color: #1a1917 !important; }
    .ct-ink    { color: #f5f3ef !important; }
    .ct-muted  { color: #a3a09a !important; }
    .ct-rule   { border-color: #2a2825 !important; }
    .ct-tint   { background-color: #16211d !important; }
    .ct-accent { color: #34d9a4 !important; }
    .ct-btn    { background-color: #34d9a4 !important; }
    .ct-btn a  { color: #0d1512 !important; }
    /* The week strip carries its text colour on the cell's children rather than
       the cell, because the three states invert differently: a filled day keeps
       dark text on the light accent, an empty one goes the other way. */
    .ct-day-hit     { background-color: #34d9a4 !important; }
    .ct-day-hit div { color: #0d1512 !important; }
    .ct-day-logged     { background-color: #16211d !important; }
    .ct-day-logged div { color: #f5f3ef !important; }
    .ct-day-missing     { background-color: #232120 !important; }
    .ct-day-missing div { color: #7d7a75 !important; }
  }
  /* Phones: let the card use the full width rather than keeping side gutters
     that cost a third of a small screen. */
  @media only screen and (max-width: 620px) {
    .ct-pad { padding-left: 24px !important; padding-right: 24px !important; }
    /* The stat grid keeps its two columns — see the block's own note — but the
       figures come down a step so a five-character number still fits one line. */
    .ct-fig { font-size: 20px !important; }
    /* Seven cells across a 280pt card: the number inside a day goes, the day
       itself stays. A week you can count is worth more than seven totals you
       have to squint at. */
    .ct-day-value { display: none !important; }
  }
</style>
</head>
<body class="ct-ground" style="margin:0;padding:0;background-color:${PALETTE.ground};">
<div style="display:none;font-size:1px;color:${PALETTE.ground};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(content.preheader)}${
    // Zero-width spaces stop the client scraping the body for more preview text
    // once the real preheader runs out.
    '&#8203;'.repeat(60)
  }</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="ct-ground" style="background-color:${PALETTE.ground};">
  <tr>
    <td align="center" style="padding:32px 12px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:100%;">
        <tr>
          <td class="ct-pad" style="padding:0 8px 20px;">
            ${wordmark()}
          </td>
        </tr>
        <tr>
          <td class="ct-card" style="background-color:${PALETTE.card};border-radius:16px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td class="ct-pad" style="padding:36px 40px 40px;">
                  <h1 class="ct-ink" style="margin:0 0 ${content.subheading ? '6px' : '20px'};font-family:${FONT};font-size:24px;line-height:1.3;font-weight:600;letter-spacing:-0.02em;color:${PALETTE.ink};">${escapeHtml(content.heading)}</h1>
${
  content.subheading
    ? `                  <p class="ct-muted" style="margin:0 0 24px;font-family:${FONT};font-size:14px;line-height:1.5;font-weight:600;color:${PALETTE.muted};">${escapeHtml(content.subheading)}</p>`
    : ''
}
${blocks}
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td class="ct-pad" style="padding:24px 8px 0;">
            ${footerHtml(content.unsubscribeUrl)}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/**
 * The mark, drawn rather than loaded: a rounded square in the app's forest
 * green with the wordmark beside it. An `<img>` here would be blocked by
 * default in most inboxes and leave a broken-image icon as the first thing
 * anyone sees.
 */
function wordmark(): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
  <td width="28" style="width:28px;">
    <div class="ct-btn" style="width:24px;height:24px;border-radius:8px;background-color:${PALETTE.accent};"></div>
  </td>
  <td class="ct-ink" style="font-family:${FONT};font-size:15px;font-weight:600;letter-spacing:-0.01em;color:${PALETTE.ink};padding-left:4px;">Day So Far</td>
</tr></table>`;
}

function htmlBlock(block: Block): string {
  switch (block.kind) {
    case 'text':
      return para(escapeHtml(block.text));

    case 'note':
      return `<p class="ct-muted" style="margin:0 0 16px;font-family:${FONT};font-size:13px;line-height:1.6;color:${PALETTE.muted};">${escapeHtml(block.text)}</p>`;

    case 'button':
      // The bare URL underneath is not clutter: corporate mail gateways rewrite
      // or strip anchors, and a reset link that cannot be copied by hand is a
      // support ticket.
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px;">
  <tr><td class="ct-btn" style="background-color:${PALETTE.accent};border-radius:12px;">
    <a href="${escapeAttr(block.url)}" style="display:inline-block;padding:13px 26px;font-family:${FONT};font-size:15px;font-weight:600;color:${PALETTE.accentInk};text-decoration:none;">${escapeHtml(block.label)}</a>
  </td></tr>
</table>
<p class="ct-muted" style="margin:0 0 20px;font-family:${FONT};font-size:12px;line-height:1.6;color:${PALETTE.muted};word-break:break-all;">Or paste this into your browser:<br><span class="ct-muted" style="color:${PALETTE.muted};">${escapeHtml(block.url)}</span></p>`;

    case 'facts':
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;">
${block.items
  .map(
    (item, index) => `  <tr>
    <td class="ct-muted ct-rule" style="font-family:${FONT};font-size:14px;line-height:1.5;color:${PALETTE.muted};padding:10px 12px 10px 0;${index === 0 ? '' : `border-top:1px solid ${PALETTE.hairline};`}">${escapeHtml(item.label)}</td>
    <td class="ct-ink ct-rule" align="right" style="font-family:${FONT};font-size:14px;line-height:1.5;color:${PALETTE.ink};padding:10px 0;${index === 0 ? '' : `border-top:1px solid ${PALETTE.hairline};`}">${escapeHtml(item.value)}</td>
  </tr>`,
  )
  .join('\n')}
</table>`;

    case 'stats': {
      // Two to a row, each figure in its own tinted cell, and a spacer column
      // between them — `border-spacing` is not reliable enough to hang the
      // gutter on, and margins on a `<td>` do nothing at all.
      const rows: string[] = [];
      for (let i = 0; i < block.items.length; i += 2) {
        rows.push(`  <tr>
${statCell(block.items[i]!)}
    <td width="12" style="width:12px;font-size:0;line-height:0;">&nbsp;</td>
${block.items[i + 1] ? statCell(block.items[i + 1]!) : '    <td width="50%">&nbsp;</td>'}
  </tr>
  <tr><td colspan="3" height="12" style="height:12px;font-size:0;line-height:0;">&nbsp;</td></tr>`);
      }
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 12px;">
${rows.join('\n')}
</table>`;
    }

    case 'week': {
      /*
       * Seven equal cells, one per day, coloured by what happened on it.
       *
       * Every other way of drawing a week in an email is worse: a bar chart
       * needs per-cell heights, which the Word engine behind Outlook rounds to
       * whatever it feels like, and an image needs a network fetch most inboxes
       * block by default. Seven filled boxes are just table cells, so they
       * render identically everywhere and mean the same thing at a glance —
       * how many days got written down, and how many of those landed.
       */
      const tone = {
        hit: { bg: PALETTE.accent, fg: PALETTE.accentInk, cls: 'ct-day-hit' },
        logged: { bg: PALETTE.tint, fg: PALETTE.ink, cls: 'ct-day-logged' },
        missing: { bg: PALETTE.hairline, fg: PALETTE.muted, cls: 'ct-day-missing' },
      } as const;
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 8px;">
  <tr>
${block.days
  .map((day, index) => {
    const t = tone[day.tone];
    return `    ${index === 0 ? '' : '<td width="6" style="width:6px;font-size:0;line-height:0;">&nbsp;</td>\n    '}<td width="13%" align="center" class="${t.cls}" style="background-color:${t.bg};border-radius:10px;padding:10px 2px;font-family:${FONT};">
      <div style="font-size:11px;font-weight:700;letter-spacing:0.04em;color:${t.fg};">${escapeHtml(day.label)}</div>
      ${day.value ? `<div class="ct-day-value" style="font-size:11px;color:${t.fg};opacity:0.75;padding-top:3px;">${escapeHtml(day.value)}</div>` : ''}
    </td>`;
  })
  .join('\n')}
  </tr>
</table>
${block.caption ? `<p class="ct-muted" style="margin:0 0 20px;font-family:${FONT};font-size:12px;line-height:1.6;color:${PALETTE.muted};">${escapeHtml(block.caption)}</p>` : ''}`;
    }

    case 'subhead':
      return `<p class="ct-muted" style="margin:0 0 10px;font-family:${FONT};font-size:11px;line-height:1.4;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${PALETTE.muted};">${escapeHtml(block.text)}</p>`;

    case 'callout':
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="ct-tint" style="background-color:${PALETTE.tint};border-radius:12px;margin:0 0 20px;">
  <tr><td style="padding:16px 18px;font-family:${FONT};">
    <div class="ct-accent" style="font-size:14px;font-weight:700;color:${PALETTE.accent};">${escapeHtml(block.title)}</div>
    <div class="ct-ink" style="font-size:14px;line-height:1.6;color:${PALETTE.ink};padding-top:4px;">${escapeHtml(block.text)}</div>
  </td></tr>
</table>`;

    case 'rule':
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:4px 0 24px;">
  <tr><td class="ct-rule" style="border-top:1px solid ${PALETTE.hairline};font-size:0;line-height:0;">&nbsp;</td></tr>
</table>`;

    case 'code':
      /*
       * Big, spaced, and selectable. The whole job of this block is to be read
       * off a phone and typed into a laptop, so the letterspacing is doing real
       * work — six digits run together are misread, and a wrong digit costs one
       * of five attempts. `user-select:all` makes one tap grab the lot on the
       * clients that honour it, and costs nothing on the ones that do not.
       */
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px;">
  <tr><td class="ct-tint" style="background-color:${PALETTE.tint};border-radius:12px;padding:18px 28px;">
    <div class="ct-ink" style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:32px;font-weight:600;letter-spacing:0.22em;color:${PALETTE.ink};user-select:all;">${escapeHtml(block.value)}</div>
  </td></tr>
</table>`;

    case 'quote':
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;">
  <tr><td style="border-left:3px solid ${PALETTE.accent};padding:2px 0 2px 16px;">
${block.text
  .split(/\n{2,}/)
  .map((p) => para(escapeHtml(p.trim()), 'margin:0 0 12px;'))
  .join('\n')}
  </td></tr>
</table>`;
  }
}

/** One figure, its label, and the aside under it, in a tinted half-width cell. */
function statCell(item: { label: string; value: string; hint?: string }): string {
  return `    <td width="50%" valign="top" class="ct-tint" style="width:50%;background-color:${PALETTE.tint};border-radius:12px;padding:14px 16px;font-family:${FONT};">
      <div class="ct-ink ct-fig" style="font-size:24px;font-weight:600;letter-spacing:-0.02em;line-height:1.15;color:${PALETTE.ink};">${escapeHtml(item.value)}</div>
      <div class="ct-muted" style="font-size:12px;line-height:1.4;color:${PALETTE.muted};padding-top:4px;">${escapeHtml(item.label)}</div>${
        item.hint
          ? `\n      <div class="ct-muted" style="font-size:11px;line-height:1.4;color:${PALETTE.muted};opacity:0.85;padding-top:2px;">${escapeHtml(item.hint)}</div>`
          : ''
      }
    </td>`;
}

function para(inner: string, margin = 'margin:0 0 16px;'): string {
  return `<p class="ct-ink" style="${margin}font-family:${FONT};font-size:15px;line-height:1.65;color:${PALETTE.ink};">${inner}</p>`;
}

function footerHtml(unsubscribeUrl?: string): string {
  const unsubscribe = unsubscribeUrl
    ? `<br>Don't want these? <a href="${escapeAttr(unsubscribeUrl)}" class="ct-muted" style="color:${PALETTE.muted};text-decoration:underline;">Turn off weekly emails</a>.`
    : '';

  return `<p class="ct-muted" style="margin:0;font-family:${FONT};font-size:12px;line-height:1.7;color:${PALETTE.muted};">
Day So Far — the calorie journal you talk to.${unsubscribe}
</p>`;
}

// ---- Plain text ------------------------------------------------------------

function renderText(content: EmailContent): string {
  const parts = [content.heading, ...(content.subheading ? [content.subheading] : []), ''];

  for (const block of content.blocks) {
    switch (block.kind) {
      case 'text':
      case 'note':
        parts.push(wrap(block.text), '');
        break;
      case 'code':
        // Indented so it stands out in a plain-text client the way the tinted
        // card does in an HTML one.
        parts.push(`    ${block.value}`, '');
        break;
      case 'button':
        parts.push(`${block.label}: ${block.url}`, '');
        break;
      case 'facts':
      case 'stats':
        parts.push(
          ...block.items.map(
            (item) =>
              `  ${item.label}: ${item.value}${'hint' in item && item.hint ? ` (${item.hint})` : ''}`,
          ),
          '',
        );
        break;
      case 'week':
        // The colours are the whole content of this block in HTML, so the text
        // alternative has to say in words what the fill says in green: which
        // days were logged, which of them landed, and which are simply blank.
        parts.push(
          ...block.days.map(
            (day) =>
              `  ${day.label.padEnd(4)}${day.value ?? '—'}${day.tone === 'hit' ? '  (on target)' : ''}`,
          ),
        );
        if (block.caption) parts.push(block.caption);
        parts.push('');
        break;
      case 'subhead':
        // Underscored rather than shouted: a heading in a plain-text mail is a
        // line with something under it, and has been since before HTML.
        parts.push(block.text, '-'.repeat(block.text.length), '');
        break;
      case 'callout':
        // Wrapped as one string rather than title-plus-wrapped-text, or the
        // first line comes out as long as the title made it and the rest sits
        // at 72 under it.
        parts.push(wrap(`${block.title}: ${block.text}`), '');
        break;
      case 'rule':
        parts.push('---', '');
        break;
      case 'quote':
        // Quoted the way mail has always quoted, so it reads as someone else's
        // words even with no styling to say so.
        parts.push(
          ...wrap(block.text)
            .split('\n')
            .map((line) => `> ${line}`),
          '',
        );
        break;
    }
  }

  parts.push('—', 'Day So Far — the calorie journal you talk to.');
  if (content.unsubscribeUrl) {
    parts.push(`Turn off weekly emails: ${content.unsubscribeUrl}`);
  }

  return `${parts.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

/** Hard-wrapped at 72 columns, the width plain-text mail has always assumed. */
function wrap(text: string, width = 72): string {
  return text
    .split('\n')
    .map((line) => {
      const out: string[] = [];
      let current = '';
      for (const word of line.split(' ')) {
        if (current && `${current} ${word}`.length > width) {
          out.push(current);
          current = word;
        } else {
          current = current ? `${current} ${word}` : word;
        }
      }
      out.push(current);
      return out.join('\n');
    })
    .join('\n');
}

// ---- Escaping --------------------------------------------------------------

/**
 * Everything interpolated into the HTML goes through here. Most of it is ours,
 * but not all: display names, and the journal's own prose about someone's week,
 * both reach a template — and an email is a document sent to a third party's
 * renderer, which is the last place to be relaxed about who wrote the markup.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** As above, and additionally refuses a scheme an email has no business using. */
export function escapeAttr(url: string): string {
  return /^https?:\/\//i.test(url) ? escapeHtml(url) : '#';
}
