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
};

describe('renderEmail', () => {
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
    expect(email.html).toContain('background-color:#f2f0ec');
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
