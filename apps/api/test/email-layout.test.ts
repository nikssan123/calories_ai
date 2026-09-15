import { describe, expect, it } from 'vitest';
import { escapeAttr, escapeHtml, renderEmail } from '../src/email/layout.ts';

/**
 * The layout has no dependencies and no clock, so these are ordinary unit
 * tests. What they are really guarding is the pair of invariants that make the
 * rest of the email code safe to write: nothing interpolated reaches the
 * document unescaped, and every block that appears in the HTML also appears in
 * the plain-text alternative.
 */

const BASE = {
  subject: 'Subject line',
  preheader: 'The line the inbox shows.',
  heading: 'A heading',
  blocks: [],
  locale: 'en' as const,
};

describe('renderEmail', () => {
  it('opens on the cast: three round faces in the macro colours, drawn from cells, not loaded', () => {
    const email = renderEmail({ ...BASE, blocks: [{ kind: 'text', text: 'Hello.' }] });
    for (const colour of ['#ffa51f', '#3b9eff', '#b06bff']) {
      expect(email.html).toContain(`bgcolor="${colour}" style="width:16px;height:16px;background-color:${colour};border-radius:50%;`);
    }
    expect(email.html).not.toContain('<img');
    expect(email.html).not.toContain('<svg');
  });

  it('carries the subject into the title and the preheader into a hidden block', () => {
    const email = renderEmail({ ...BASE, blocks: [{ kind: 'text', text: 'Hello.' }] });

    expect(email.subject).toBe('Subject line');
    expect(email.html).toContain('<title>Subject line</title>');
    expect(email.html).toContain('The line the inbox shows.');
    // Hidden, or it renders twice at the top of the message.
    expect(email.html).toMatch(/display:none[^>]*>The line the inbox shows\./);
  });

  it('declares both colour schemes, and defines the light one inline', () => {
    const email = renderEmail(BASE);

    expect(email.html).toContain('name="color-scheme" content="light dark"');
    expect(email.html).toContain('@media (prefers-color-scheme: dark)');
    // The inline background is what a client that strips <style> falls back to.
    expect(email.html).toContain('background-color:#fbf3e7');
    expect(email.html).toContain('background-color:#fffaf2;border:1px solid #eadcc9');
    // And the dark one mirrors it, in both the media query and Outlook.com's hooks.
    expect(email.html).toContain('.ct-ground { background-color: #1a1512 !important; }');
    expect(email.html).toContain('[data-ogsb] .ct-card { background-color: #241d19 !important;');
  });

  it('gives the header band a solid colour that survives a stripped gradient', () => {
    const email = renderEmail(BASE);
    const band = email.html.match(/<td class="ct-band[^"]*"[^>]*>/)?.[0];

    expect(band).toBeDefined();
    // Outlook and Gmail both drop the gradient. `bgcolor` survives even a
    // stripped style attribute; the inline colour covers clients that drop only
    // the image — so it must come *before* the gradient, not after.
    expect(band).toContain('bgcolor="#12b76a"');
    expect(band).toMatch(
      /background-color:#12b76a;background-image:linear-gradient\(135deg,#12b76a,#23d3b0\)/,
    );
    // The wordmark sits in it, not on the cream above the card.
    expect(email.html.indexOf('Day So Far')).toBeGreaterThan(email.html.indexOf(band!));
  });

  it('draws the logo as a ring on the band, not a filled box', () => {
    const email = renderEmail(BASE);
    const mark = email.html.match(/<td class="ct-mark"[^>]*>/)?.[0];

    expect(mark).toBeDefined();
    expect(mark).toContain('border:4px solid #ffffff');
    expect(mark).toContain('border-radius:50%');
    expect(mark).not.toMatch(/background-color/);
    expect(email.html.match(/class="ct-mark-dot"/g)).toHaveLength(3);
  });

  it('holds the gutter between two stat tiles open with content, not just a width', () => {
    const email = renderEmail({
      ...BASE,
      blocks: [{ kind: 'stats', items: [{ label: 'a', value: '1' }, { label: 'b', value: '2' }] }],
    });

    // Two 50% cells squeeze a width-only spacer to nothing; a 12px block cannot be.
    expect(email.html).toMatch(/<td width="12"[^>]*><div style="width:12px;/);
  });

  it('sets the heading in a serif that needs no web font to arrive', () => {
    const email = renderEmail(BASE);
    const heading = email.html.match(/<h1\b[^>]*>A heading<\/h1>/)?.[0];

    expect(heading).toBeDefined();
    expect(heading).toMatch(/font-family:Fraunces, Georgia, 'Times New Roman', serif;/);
    // Outlook is told Georgia outright rather than trusted to walk the stack.
    expect(heading).toContain('ct-serif');
    expect(email.html).toMatch(/<!--\[if mso\]>[\s\S]*\.ct-serif \{ font-family: Georgia/);
  });

  it('loads nothing from the network', () => {
    const email = renderEmail({
      ...BASE,
      blocks: [
        { kind: 'text', text: 'Body.' },
        { kind: 'button', label: 'Go', url: 'https://example.test/go' },
      ],
    });

    // The only external reference allowed is the one the reader chose to click.
    expect(email.html).not.toMatch(/<img\b/);
    expect(email.html).not.toMatch(/<link\b/);
    expect(email.html).not.toMatch(/url\(/);
    expect(email.html.match(/https?:\/\/[^\s"'<]+/g)).toEqual([
      'https://example.test/go',
      'https://example.test/go',
    ]);
  });

  it('prints the destination beside the button, for gateways that strip anchors', () => {
    const email = renderEmail({
      ...BASE,
      blocks: [{ kind: 'button', label: 'Reset', url: 'https://example.test/reset?token=abc' }],
    });

    expect(email.html).toContain('href="https://example.test/reset?token=abc"');
    expect(email.html).toContain('Or paste this into your browser:');
    expect(email.text).toContain('Reset: https://example.test/reset?token=abc');
  });

  it('renders every block kind into the text alternative', () => {
    const email = renderEmail({
      ...BASE,
      blocks: [
        { kind: 'text', text: 'A paragraph.' },
        { kind: 'note', text: 'Small print.' },
        { kind: 'button', label: 'Open', url: 'https://example.test/' },
        { kind: 'facts', items: [{ label: 'When', value: 'Tuesday' }] },
        { kind: 'stats', items: [{ label: 'Days logged', value: '5/7' }] },
        { kind: 'quote', text: 'Someone else said this.' },
      ],
    });

    expect(email.text).toContain('A paragraph.');
    expect(email.text).toContain('Small print.');
    expect(email.text).toContain('Open: https://example.test/');
    expect(email.text).toContain('  When: Tuesday');
    expect(email.text).toContain('  Days logged: 5/7');
    // Quoted the way mail has always quoted.
    expect(email.text).toContain('> Someone else said this.');
    expect(email.text.endsWith('\n')).toBe(true);
  });

  it('splits a multi-paragraph quote in both renderings', () => {
    const email = renderEmail({
      ...BASE,
      blocks: [{ kind: 'quote', text: 'First thought.\n\nSecond thought.' }],
    });

    expect(email.html).toContain('First thought.');
    expect(email.html).toContain('Second thought.');
    expect(email.text).toContain('> First thought.');
    expect(email.text).toContain('> Second thought.');
  });

  it('wraps long text so a terminal reader gets sane lines', () => {
    const email = renderEmail({
      ...BASE,
      blocks: [{ kind: 'text', text: 'word '.repeat(60).trim() }],
    });

    const longest = Math.max(...email.text.split('\n').map((line) => line.length));
    expect(longest).toBeLessThanOrEqual(72);
  });

  it('shows the unsubscribe link only when the message has one', () => {
    const without = renderEmail(BASE);
    expect(without.html).not.toContain('Turn off weekly emails');
    expect(without.text).not.toContain('Turn off weekly emails');

    const withLink = renderEmail({ ...BASE, unsubscribeUrl: 'https://example.test/unsubscribe' });
    expect(withLink.html).toContain('href="https://example.test/unsubscribe"');
    expect(withLink.text).toContain('Turn off weekly emails: https://example.test/unsubscribe');
  });
});

describe('escaping', () => {
  it('neutralises markup in anything interpolated', () => {
    const email = renderEmail({
      locale: 'en',
      subject: 'Hi <script>alert(1)</script>',
      preheader: 'x',
      heading: '<b>Bold</b>',
      blocks: [
        { kind: 'text', text: '</p><img src=x onerror=alert(1)>' },
        { kind: 'facts', items: [{ label: '<i>l</i>', value: '"v"' }] },
        { kind: 'quote', text: "it's <em>mine</em>" },
      ],
    });

    expect(email.html).not.toContain('<script>');
    expect(email.html).not.toContain('<img src=x');
    expect(email.html).not.toContain('<b>Bold</b>');
    expect(email.html).toContain('&lt;script&gt;');
    expect(email.html).toContain('&lt;em&gt;mine&lt;/em&gt;');
    expect(email.html).toContain('&#39;');
  });

  it('escapes the five characters that matter, ampersand first', () => {
    expect(escapeHtml('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#39;');
    // Ampersand before the rest, or the entities escape themselves.
    expect(escapeHtml('a & <b>')).toBe('a &amp; &lt;b&gt;');
  });

  it('refuses a URL scheme an email has no business using', () => {
    expect(escapeAttr('https://example.test/x?a=1&b=2')).toBe(
      'https://example.test/x?a=1&amp;b=2',
    );
    expect(escapeAttr('http://example.test/')).toBe('http://example.test/');
    expect(escapeAttr('javascript:alert(1)')).toBe('#');
    expect(escapeAttr('data:text/html,<script>')).toBe('#');
    expect(escapeAttr('/relative')).toBe('#');
  });

  it('drops a hostile URL from the button href rather than rendering it', () => {
    const email = renderEmail({
      ...BASE,
      blocks: [{ kind: 'button', label: 'Click', url: 'javascript:alert(1)' }],
    });

    expect(email.html).toContain('href="#"');
    expect(email.html).not.toContain('href="javascript:');
  });
});
