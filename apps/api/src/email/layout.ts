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
  /** Numbers worth reading at a glance, across the width. */
  | { kind: 'stats'; items: Array<{ label: string; value: string }> }
  /** Someone else's words — in practice the journal's own prose. */
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
  }
  /* Phones: let the card use the full width rather than keeping side gutters
     that cost a third of a small screen. */
  @media only screen and (max-width: 620px) {
    .ct-pad { padding-left: 24px !important; padding-right: 24px !important; }
    .ct-stat { display: block !important; width: 100% !important; padding-bottom: 16px !important; }
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
                  <h1 class="ct-ink" style="margin:0 0 20px;font-family:${FONT};font-size:24px;line-height:1.3;font-weight:600;letter-spacing:-0.02em;color:${PALETTE.ink};">${escapeHtml(content.heading)}</h1>
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

    case 'stats':
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="ct-tint" style="background-color:${PALETTE.tint};border-radius:12px;margin:0 0 20px;">
  <tr>
    <td style="padding:18px 20px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
${block.items
  .map(
    (item) => `        <td class="ct-stat" valign="top" style="font-family:${FONT};padding-right:12px;">
          <div class="ct-ink" style="font-size:22px;font-weight:600;letter-spacing:-0.02em;color:${PALETTE.ink};">${escapeHtml(item.value)}</div>
          <div class="ct-muted" style="font-size:12px;color:${PALETTE.muted};padding-top:2px;">${escapeHtml(item.label)}</div>
        </td>`,
  )
  .join('\n')}
      </tr></table>
    </td>
  </tr>
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
  const parts = [content.heading, ''];

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
        parts.push(...block.items.map((item) => `  ${item.label}: ${item.value}`), '');
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
