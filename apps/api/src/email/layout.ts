import { intlLocale, type Locale } from '@ct/shared';
import { emailMessages, type EmailMessages } from './messages.ts';

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
 *   the mark is drawn with borders and a border-radius, so the message looks
 *   the same with remote content blocked, which is how most people read it.
 * - Every word this module draws by itself — the footer, the line under a
 *   button — comes out of `messages.ts` rather than out of a template literal
 *   here. There are exactly four of them and they are the only ones a template
 *   above cannot see, so they are also the easiest to leave in English by
 *   accident, which is what happened until 2026-08-31.
 */

/**
 * Cream paper and warm ink, matching the app's light theme since the 2026-09
 * redesign. The inbox is the one place the product is seen next to everybody
 * else's mail, so it should look like the app someone installed rather than
 * like a receipt from it.
 */
const PALETTE = {
  ground: '#fbf3e7',
  card: '#fffaf2',
  ink: '#31261e',
  muted: '#77685b',
  hairline: '#eadcc9',
  /**
   * The button and the filled day. Deliberately not the band's brighter
   * `#12b76a`: white on that is about 2.6:1, and a button label is text
   * somebody has to read, not a logotype. This green is 5.2:1.
   */
  accent: '#0f7b5c',
  accentInk: '#ffffff',
  /**
   * Green, lightly — a callout, and a day that was logged but missed. It stays
   * green on a cream card on purpose: the week strip is read as "solid green,
   * pale green, grey", and a warm tint here would put the middle state in the
   * same family as the paper and lose it.
   */
  tint: '#e8f4ec',
  /** A deeper cream for anything set into the card: a figure, a code, a person. */
  inset: '#f6ecdf',
  /**
   * A day with nothing on it. A cool grey rather than another cream, because
   * the coach digest's own legend calls it "a grey one", and because on a
   * person card it sits against `inset` and has to be told apart from it.
   */
  empty: '#e6e1db',
  /** The header band, as a pair: a gradient where it renders, `band` alone where not. */
  band: '#12b76a',
  bandTo: '#23d3b0',
  onBand: '#ffffff',
  /**
   * The logo's faint track, as white at about a third over the band's green.
   * Mixed down to a solid colour rather than written as `rgba()`, because the
   * Word engine drops an rgba border and would draw the ring closed.
   */
  onBandTrack: '#65d09e',
  /**
   * The macro colours, exactly as the app draws protein, carbs and fat. Used
   * once, as a signature above the heading, and nowhere that could be read as
   * data: a stat cell tinted orange would say "protein" about a number that is
   * not protein.
   */
  protein: '#ffa51f',
  carbs: '#3b9eff',
  fat: '#b06bff',
};

/**
 * The dark counterpart, applied only through the overrides in `DARK_RULES`.
 * There is no `band` here: the band is the same green in both themes — it is
 * the brand, and it already reads as a lit surface on a dark ground.
 */
const DARK = {
  ground: '#1a1512',
  card: '#241d19',
  ink: '#f7efe6',
  muted: '#a79a8d',
  hairline: '#4d3d33',
  accent: '#34d9a4',
  accentInk: '#0d1512',
  tint: '#1c3228',
  inset: '#2f2621',
  empty: '#3a312b',
};

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

/**
 * The heading face. Fraunces is the app's display serif, and it is named first
 * only so the rare machine that has it installed uses it — nothing here loads
 * it, because a web font is a network fetch and this module makes none. The
 * face almost everybody actually sees is Georgia, which ships with macOS, iOS
 * and Windows and was drawn for screens; Android has no Georgia and lands on
 * `serif`, which is Noto Serif and holds the same editorial register. Outlook's
 * Word engine gets Georgia forced on it separately — see the `mso` block in
 * the head.
 */
const SERIF = "Fraunces, Georgia, 'Times New Roman', serif";

/**
 * The header band's gradient, written once so the inline style and the dark
 * overrides cannot drift.
 *
 * The gradient is decoration, and the solid green under it is written twice
 * more on the band's cell; neither copy is redundant. Outlook's Word engine
 * and Gmail both discard a gradient, and Gmail has been known to discard a
 * whole style attribute over one declaration it dislikes. So the solid colour
 * sits in the style *before* the gradient, for clients that drop only the
 * image, and in `bgcolor`, which lives outside the style attribute and
 * survives it being stripped. Without both, the white wordmark lands on the
 * cream card and vanishes — the one failure here that loses a word rather
 * than a flourish.
 */
const BAND_GRADIENT = `linear-gradient(135deg,${PALETTE.band},${PALETTE.bandTo})`;

/**
 * A warm shadow under the card. It is the one thing in this layout most
 * clients drop — Gmail and every Outlook among them — and the card's hairline
 * border is why that costs nothing: the card still has an edge against the
 * cream without it. Never lean on the shadow to separate anything.
 */
const CARD_SHADOW = '0 18px 40px -24px rgba(120,80,20,.35)';

/**
 * Every dark-theme override, as data, so the two places that need it are
 * generated from one list: the `prefers-color-scheme` query that Apple Mail,
 * iOS and Outlook for Mac honour, and the `[data-ogsc]`/`[data-ogsb]` hooks
 * that Outlook.com stamps on the elements it has recoloured in its own dark
 * mode. Written twice by hand, they would disagree within a release.
 *
 * Only ever an override of the inline light palette; nothing here is load
 * bearing, because plenty of clients will never run it.
 */
const DARK_RULES: Array<[selector: string, declarations: string[]]> = [
  ['.ct-ground', [`background-color: ${DARK.ground}`]],
  ['.ct-card', [`background-color: ${DARK.card}`, `border-color: ${DARK.hairline}`]],
  ['.ct-ink', [`color: ${DARK.ink}`]],
  ['.ct-muted', [`color: ${DARK.muted}`]],
  ['.ct-rule', [`border-color: ${DARK.hairline}`]],
  ['.ct-tint', [`background-color: ${DARK.tint}`]],
  ['.ct-inset', [`background-color: ${DARK.inset}`]],
  ['.ct-accent', [`color: ${DARK.accent}`]],
  ['.ct-btn', [`background-color: ${DARK.accent}`]],
  ['.ct-btn a', [`color: ${DARK.accentInk}`]],
  /*
   * The band and what sits on it are restated rather than changed. In Apple
   * Mail that is a no-op; in Outlook.com it is the whole point, because its
   * dark mode darkens any background it finds, and a muddy olive band with a
   * grey wordmark on it is worse than no band at all.
   */
  ['.ct-band', [`background-color: ${PALETTE.band}`, `background-image: ${BAND_GRADIENT}`]],
  ['.ct-on-band', [`color: ${PALETTE.onBand}`]],
  [
    '.ct-mark',
    [`border-color: ${PALETTE.onBand} ${PALETTE.onBand} ${PALETTE.onBand} ${PALETTE.onBandTrack}`],
  ],
  ['.ct-mark-dot', [`background-color: ${PALETTE.onBand}`]],
  /*
   * The week strip carries its text colour on the cell's children rather than
   * the cell, because the three states invert differently: a filled day keeps
   * dark text on the light accent, an empty one goes the other way.
   */
  ['.ct-day-hit', [`background-color: ${DARK.accent}`]],
  ['.ct-day-hit div', [`color: ${DARK.accentInk}`]],
  ['.ct-day-logged', [`background-color: ${DARK.tint}`]],
  ['.ct-day-logged div', [`color: ${DARK.ink}`]],
  ['.ct-day-missing', [`background-color: ${DARK.empty}`]],
  ['.ct-day-missing div', [`color: ${DARK.muted}`]],
];

function darkRules(prefix: (selector: string) => string, indent: string): string {
  return DARK_RULES.map(
    ([selector, declarations]) =>
      `${indent}${prefix(selector)} { ${declarations.map((d) => `${d} !important;`).join(' ')} }`,
  ).join('\n');
}

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
  | { kind: 'code'; value: string }
  /**
   * One person, as a card: a name, a sentence about them, optionally their
   * week as seven cells, and one line of numbers underneath.
   *
   * Built for the coach's digest, where the reader is scanning a list of
   * people rather than reading about themselves. A `facts` row cannot hold a
   * person — the name lands in the narrow muted column and everything else
   * wraps in the wide one — and a `callout` puts the name in the accent, which
   * on a card about somebody who has stopped logging reads as congratulation.
   */
  | {
      kind: 'person';
      name: string;
      status: string;
      days?: Array<{ label: string; value: string | null; tone: 'hit' | 'logged' | 'missing' }>;
      caption: string;
    };

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
  /**
   * The reader's language, for the chrome this module draws and for `lang`.
   *
   * Required rather than defaulted to English, because a default is what a
   * caller forgets: every template already knows the locale it was handed, and
   * the compiler asking for it is what stops the next one being written without
   * it. `lang` is not decoration either — it is what a screen reader picks a
   * voice from and what a client's translate prompt reads.
   */
  locale: Locale;
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

/**
 * The column is fluid — 100% wide, capped at 600 — with a fixed 600px table
 * around it that only Outlook can see.
 *
 * It used to be the other way up: `width:600px; max-width:100%`. That reads as
 * "600, or less on a phone", but a percentage cap inside a table cell resolves
 * against a cell whose width is itself waiting on its content, so engines skip
 * it when sizing the cell, the cell grows to 600, and on a 375pt screen the
 * card ran off the right edge — or the client zoomed the whole message out to
 * fit, and the phone styles below applied to text too small to read. Outlook's
 * Word engine is the one that ignores `max-width` and would stretch a fluid
 * column across a desktop monitor, hence the conditional table.
 */
function renderHtml(content: EmailContent): string {
  const m = emailMessages(content.locale);
  const blocks = content.blocks.map((block) => htmlBlock(block, m)).join('\n');

  return `<!doctype html>
<html lang="${escapeHtml(intlLocale(content.locale))}">
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
  /* The dark palette. Generated from DARK_RULES in layout.ts. */
  @media (prefers-color-scheme: dark) {
${darkRules((selector) => selector, '    ')}
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
<style>
  /* Outlook.com's dark mode, in a block of its own. Gmail throws away a whole
     <style> element over a selector it will not parse, and attribute selectors
     are the likeliest candidate — kept apart, the worst it can cost is these
     rules rather than the phone layout above with them. */
${darkRules((selector) => `[data-ogsc] ${selector}, [data-ogsb] ${selector}`, '  ')}
</style>
<!--[if mso]>
<style>
  /* Outlook's Word engine is unreliable about walking a font stack past a
     first face it lacks, and drops to Times New Roman when it gives up. Close,
     but Georgia is the heading everyone else sees, so it is named outright. */
  .ct-serif { font-family: Georgia, 'Times New Roman', serif !important; }
</style>
<![endif]-->
</head>
<body class="ct-ground" style="margin:0;padding:0;background-color:${PALETTE.ground};">
<div style="display:none;font-size:1px;color:${PALETTE.ground};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(content.preheader)}${
    // Zero-width spaces stop the client scraping the body for more preview text
    // once the real preheader runs out.
    '&#8203;'.repeat(60)
  }</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="ct-ground" style="background-color:${PALETTE.ground};">
  <tr>
    <td align="center" style="padding:40px 12px 32px;">
      <!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" align="center"><tr><td><![endif]-->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;max-width:600px;margin:0 auto;">
        <tr>
          <td class="ct-card" bgcolor="${PALETTE.card}" style="background-color:${PALETTE.card};border:1px solid ${PALETTE.hairline};border-radius:24px;box-shadow:${CARD_SHADOW};">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td class="ct-band ct-pad" bgcolor="${PALETTE.band}" style="background-color:${PALETTE.band};background-image:${BAND_GRADIENT};border-radius:23px 23px 0 0;padding:20px 40px;">
                  ${wordmark()}
                </td>
              </tr>
              <tr>
                <td class="ct-pad" style="padding:30px 40px 40px;">
                  ${signature()}
                  <h1 class="ct-ink ct-serif" style="margin:0 0 ${content.subheading ? '8px' : '20px'};font-family:${SERIF};font-size:30px;line-height:1.2;font-weight:500;letter-spacing:-0.015em;color:${PALETTE.ink};">${escapeHtml(content.heading)}</h1>
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
            ${footerHtml(m, content.unsubscribeUrl)}
          </td>
        </tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td>
  </tr>
</table>
</body>
</html>`;
}

/**
 * The mark, drawn rather than loaded, with the wordmark beside it, both in
 * white on the band. An `<img>` here would be blocked by default in most
 * inboxes and leave a broken-image icon as the first thing anyone sees; an
 * inline `<svg>` of `logo.svg` fares no better, since Gmail deletes it and
 * Outlook never draws it, and the band would open on a hole.
 *
 * So the logo is rebuilt from what every engine can draw: a table cell with a
 * thick border and a 50% radius is the ring, and three cells inside it are the
 * three dots. Three sides of the border are solid and the left one is the faint
 * track, which puts the break in the ring on the left the way the logo's own
 * arc breaks at the upper left — near enough at 26 pixels, and turning the
 * box to match exactly would need `transform`, which Gmail and Outlook ignore.
 * The bubble's tail is left out: it hangs off the ring, and hanging anything
 * off anything needs positioning no mail client honours. Outlook's Word engine
 * ignores the radius, and draws a small square frame with three dots in it —
 * still a mark, still white, where the old one was a blank square everywhere.
 *
 * White on the band's green is well under the 4.5:1 body text needs, and that
 * is acceptable only because this is a logotype, which the contrast rules
 * exempt. It is also why nothing else is ever put in the band: no heading, no
 * date, no copy. The moment a sentence goes up there it has to be read.
 */
function wordmark(): string {
  const dot = `<td width="3" height="3" class="ct-mark-dot" bgcolor="${PALETTE.onBand}" style="width:3px;height:3px;background-color:${PALETTE.onBand};border-radius:50%;font-size:0;line-height:0;">&nbsp;</td>`;
  const gap = '<td width="2" style="width:2px;font-size:0;line-height:0;">&nbsp;</td>';
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
  <td width="36" style="width:36px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td class="ct-mark" width="18" height="18" align="center" valign="middle" style="width:18px;height:18px;border:4px solid ${PALETTE.onBand};border-left-color:${PALETTE.onBandTrack};border-radius:50%;font-size:0;line-height:0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>${dot}${gap}${dot}${gap}${dot}</tr></table>
      </td>
    </tr></table>
  </td>
  <td class="ct-on-band" style="font-family:${FONT};font-size:16px;font-weight:600;letter-spacing:-0.01em;color:${PALETTE.onBand};">Day So Far</td>
</tr></table>`;
}

/**
 * The three dots above the heading, with faces: Ember, Skye and Plum, the
 * app's cast (CAST.md), reduced to what a mail client can draw.
 *
 * The one place those colours appear, and it says nothing: it is the same on
 * a password reset as on a weekly review, so no reader can take it for a
 * figure. It used to be three short bars; the dots are the same colours, now
 * with two eyes each, so an email looks like it came from the app it's about.
 *
 * Drawn the way `wordmark` draws the logo, from table cells: a round cell in
 * the macro colour with `bgcolor` as well as a background, and two tiny ink
 * cells inside it for eyes. No image, no SVG, no network. Outlook's Word engine
 * ignores the radius and draws three small squares with eyes, which is still
 * them.
 */
function signature(): string {
  const eye = `<td width="2" height="3" bgcolor="${PALETTE.ink}" style="width:2px;height:3px;background-color:${PALETTE.ink};border-radius:1px;font-size:0;line-height:0;">&nbsp;</td>`;
  const between = '<td width="3" style="width:3px;font-size:0;line-height:0;">&nbsp;</td>';
  const face = (colour: string) =>
    `<td width="16" height="16" align="center" valign="middle" bgcolor="${colour}" style="width:16px;height:16px;background-color:${colour};border-radius:50%;font-size:0;line-height:0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>${eye}${between}${eye}</tr></table>
    </td>`;
  const gap = '<td width="5" style="width:5px;font-size:0;line-height:0;">&nbsp;</td>';
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;"><tr>${face(PALETTE.protein)}${gap}${face(PALETTE.carbs)}${gap}${face(PALETTE.fat)}</tr></table>`;
}

function htmlBlock(block: Block, m: EmailMessages): string {
  switch (block.kind) {
    case 'text':
      return para(escapeHtml(block.text));

    case 'note':
      return `<p class="ct-muted" style="margin:0 0 16px;font-family:${FONT};font-size:13px;line-height:1.6;color:${PALETTE.muted};">${escapeHtml(block.text)}</p>`;

    case 'button':
      // The bare URL underneath is not clutter: corporate mail gateways rewrite
      // or strip anchors, and a reset link that cannot be copied by hand is a
      // support ticket.
      //
      // Solid, where the band above is a gradient. A second gradient would
      // compete with the band for the eye, and any stop lighter than this green
      // takes the white label under 4.5:1 for part of its width. `bgcolor` is
      // there for the same reason as the band's: Outlook paints it when it
      // paints nothing else.
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px;">
  <tr><td class="ct-btn" bgcolor="${PALETTE.accent}" style="background-color:${PALETTE.accent};border-radius:14px;">
    <a href="${escapeAttr(block.url)}" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:15px;font-weight:600;color:${PALETTE.accentInk};text-decoration:none;border-radius:14px;">${escapeHtml(block.label)}</a>
  </td></tr>
</table>
<p class="ct-muted" style="margin:0 0 20px;font-family:${FONT};font-size:12px;line-height:1.6;color:${PALETTE.muted};word-break:break-all;">${escapeHtml(m['layout.pasteLink'])}<br><span class="ct-muted" style="color:${PALETTE.muted};">${escapeHtml(block.url)}</span></p>`;

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
      //
      // The spacer holds a 12px block, and that block is the gutter. Its
      // `width` alone was never honoured: two 50% cells already claim the whole
      // table, so the automatic table algorithm squeezes the fixed column down
      // to its content — a zero-size `&nbsp;` — and the tiles met with about
      // 2px between them. A column cannot be squeezed below its content, so the
      // 50% cells give way instead, at every card width, phones included.
      const rows: string[] = [];
      for (let i = 0; i < block.items.length; i += 2) {
        rows.push(`  <tr>
${statCell(block.items[i]!)}
    <td width="12" style="width:12px;min-width:12px;font-size:0;line-height:0;"><div style="width:12px;height:1px;font-size:0;line-height:0;"></div></td>
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
        missing: { bg: PALETTE.empty, fg: PALETTE.muted, cls: 'ct-day-missing' },
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

    case 'person': {
      /*
       * The same three tones the week block uses, drawn smaller: the strip
       * sits inside a card with a name over it, so the cells lose their inner
       * figure on a phone the way the week block's do.
       *
       * Genuinely the same three, now. The card used to sit in the green tint,
       * so a logged day had to borrow the card's white to show up against it —
       * and in dark mode the two resolved to one colour and the day vanished.
       * With the card in the cream inset, a logged day can be pale green here
       * exactly as it is in the week block.
       */
      const tone = {
        hit: { bg: PALETTE.accent, fg: PALETTE.accentInk, cls: 'ct-day-hit' },
        logged: { bg: PALETTE.tint, fg: PALETTE.ink, cls: 'ct-day-logged' },
        missing: { bg: PALETTE.empty, fg: PALETTE.muted, cls: 'ct-day-missing' },
      } as const;
      const strip = block.days
        ? `    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:10px 0 8px;">
      <tr>
${block.days
  .map((day, index) => {
    const t = tone[day.tone];
    return `        ${index === 0 ? '' : '<td width="4" style="width:4px;font-size:0;line-height:0;">&nbsp;</td>\n        '}<td width="13%" align="center" class="${t.cls}" style="background-color:${t.bg};border-radius:8px;padding:7px 2px;font-family:${FONT};">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.04em;color:${t.fg};">${escapeHtml(day.label)}</div>
          ${day.value ? `<div class="ct-day-value" style="font-size:10px;color:${t.fg};opacity:0.75;padding-top:2px;">${escapeHtml(day.value)}</div>` : ''}
        </td>`;
  })
  .join('\n')}
      </tr>
    </table>`
        : '';
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="ct-inset" style="background-color:${PALETTE.inset};border-radius:16px;margin:0 0 10px;">
  <tr><td style="padding:14px 16px;font-family:${FONT};">
    <div class="ct-ink" style="font-size:15px;font-weight:700;line-height:1.4;color:${PALETTE.ink};">${escapeHtml(block.name)}</div>
    <div class="ct-ink" style="font-size:14px;line-height:1.5;color:${PALETTE.ink};padding-top:2px;">${escapeHtml(block.status)}</div>
${strip}
    <div class="ct-muted" style="font-size:12px;line-height:1.6;color:${PALETTE.muted};padding-top:${block.days ? '0' : '4px'};">${escapeHtml(block.caption)}</div>
  </td></tr>
</table>`;
    }

    case 'callout':
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="ct-tint" style="background-color:${PALETTE.tint};border-radius:16px;margin:0 0 20px;">
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
  <tr><td class="ct-inset" style="background-color:${PALETTE.inset};border-radius:16px;padding:18px 28px;">
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

/**
 * One figure, its label, and the aside under it, in an inset half-width cell.
 *
 * The figure stays in the sans face while the heading above went serif.
 * Georgia draws old-style numerals — the 3, 4, 5, 7 and 9 drop below the
 * line — which is lovely in a sentence and wrong in a grid, where "1 842" and
 * "5/7" should sit on one baseline and be compared at a glance.
 */
function statCell(item: { label: string; value: string; hint?: string }): string {
  return `    <td width="50%" valign="top" class="ct-inset" style="width:50%;background-color:${PALETTE.inset};border-radius:16px;padding:16px 18px;font-family:${FONT};">
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

function footerHtml(m: EmailMessages, unsubscribeUrl?: string): string {
  const unsubscribe = unsubscribeUrl
    ? `<br>${escapeHtml(m['layout.unsubscribePrompt'])} <a href="${escapeAttr(unsubscribeUrl)}" class="ct-muted" style="color:${PALETTE.muted};text-decoration:underline;">${escapeHtml(m['layout.unsubscribeAction'])}</a>.`
    : '';

  return `<p class="ct-muted" style="margin:0;font-family:${FONT};font-size:12px;line-height:1.7;color:${PALETTE.muted};">
${escapeHtml(m['layout.tagline'])}${unsubscribe}
</p>`;
}

// ---- Plain text ------------------------------------------------------------

function renderText(content: EmailContent): string {
  const m = emailMessages(content.locale);
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
              `  ${day.label.padEnd(4)}${day.value ?? '—'}${day.tone === 'hit' ? `  (${m['layout.onTarget']})` : ''}`,
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
      case 'person':
        // The name, the sentence, the week as filled and empty circles, and
        // the numbers — each on its own line, indented under the name.
        parts.push(block.name, `  ${block.status}`);
        if (block.days) {
          parts.push(
            `  ${block.days.map((day) => `${day.label}${day.tone === 'missing' ? '○' : '●'}`).join(' ')}`,
          );
        }
        parts.push(`  ${block.caption}`, '');
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

  parts.push('—', m['layout.tagline']);
  if (content.unsubscribeUrl) {
    parts.push(`${m['layout.unsubscribeAction']}: ${content.unsubscribeUrl}`);
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
