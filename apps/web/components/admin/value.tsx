'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import type { TableField } from '@ct/shared';
import { cn } from '@/lib/utils';

/**
 * How a database value is rendered, in the two places it has to be.
 *
 * The panel used to have one renderer, and it truncated: every value longer
 * than sixty characters ended in an ellipsis and the rest of it existed only in
 * a `title` attribute, which is to say only for someone with a mouse and the
 * patience to hover. A meal description, a tool trace, a support email body —
 * the columns you actually open the browser to read — were exactly the ones it
 * cut. So there are two renderers now: `Inline` is allowed to be short because
 * `Full` exists behind a click, and nothing is only ever available truncated.
 */

const NUMERIC = new Set(['int2', 'int4', 'int8', 'float4', 'float8', 'numeric']);
const TEMPORAL = new Set(['timestamptz', 'timestamp', 'date', 'time', 'timetz']);
const STRUCTURED = new Set(['json', 'jsonb']);

export function isNumeric(type: string): boolean {
  return NUMERIC.has(type);
}

/** Whether the value wants a `<pre>` rather than a line of text. */
export function isBlock(value: unknown, field: TableField): boolean {
  if (value === null || value === undefined) return false;
  if (STRUCTURED.has(field.type) || typeof value === 'object') return true;
  return typeof value === 'string' && (value.length > 80 || value.includes('\n'));
}

/** The one-line form: what a cell shows before anyone asks for more. */
export function text(value: unknown, field: TableField): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') return JSON.stringify(value) ?? '';
  if (TEMPORAL.has(field.type) && typeof value === 'string') return moment(value);
  return String(value);
}

/** The whole form: what the row inspector shows, wrapped and pretty-printed. */
export function full(value: unknown, field: TableField): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  if (STRUCTURED.has(field.type) && typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  return String(value);
}

/**
 * Timestamps, shortened only where the shortening cannot mislead.
 *
 * `date` columns arrive as `YYYY-MM-DD` already and are left alone — they are
 * somebody's local day, and attaching a time to one would invent a precision
 * the column does not have. Timestamps lose their seconds and their timezone
 * suffix, which they all share.
 */
function moment(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.toISOString().slice(0, 10)} ${date.toISOString().slice(11, 16)}`;
}

/** A value in a table cell. Tone carries the type, so the eye can skim a column. */
export function Inline({ value, field }: { value: unknown; field: TableField }) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground/60 italic">null</span>;
  }
  if (typeof value === 'boolean') {
    return (
      <span className={value ? 'text-[var(--positive)] font-semibold' : 'text-muted-foreground'}>
        {String(value)}
      </span>
    );
  }
  if (typeof value === 'object') {
    return <span className="text-muted-foreground font-mono text-[12px]">{text(value, field)}</span>;
  }
  if (field.type === 'uuid') {
    // Split rather than shortened: the tail is what distinguishes two ids at a
    // glance, and it is the half a truncating renderer throws away.
    const id = String(value);
    return (
      <span className="font-mono text-[12px]">
        <span className="text-muted-foreground">{id.slice(0, 8)}</span>
        {id.slice(8)}
      </span>
    );
  }
  if (TEMPORAL.has(field.type) || isNumeric(field.type)) {
    return <span className="tnum">{text(value, field)}</span>;
  }
  return <span>{String(value)}</span>;
}

/** The whole value, in the inspector. Block-shaped things get a block. */
export function Full({ value, field }: { value: unknown; field: TableField }) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground/60 italic">null</span>;
  }
  if (isBlock(value, field)) {
    return (
      <pre className="bg-muted/60 text-foreground max-h-80 overflow-auto rounded-lg px-3 py-2 font-mono text-[12px] leading-relaxed whitespace-pre-wrap">
        {full(value, field)}
      </pre>
    );
  }
  return (
    <span
      className={cn(
        'break-all',
        (field.type === 'uuid' || field.type === 'text') && 'font-mono text-[13px]',
        (TEMPORAL.has(field.type) || isNumeric(field.type)) && 'tnum',
      )}
    >
      {full(value, field)}
    </span>
  );
}

/** Copy to clipboard, with the two seconds of feedback that makes it trustworthy. */
export function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      title={label ?? 'Copy'}
      aria-label={label ?? 'Copy'}
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="text-muted-foreground hover:text-foreground hover:bg-muted rounded-md p-1 transition-colors"
    >
      {copied ? <Check size={14} className="text-[var(--positive)]" /> : <Copy size={14} />}
    </button>
  );
}
