'use client';

import { ArrowUpRight, KeyRound } from 'lucide-react';
import type { TableField, TablePage } from '@ct/shared';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { CopyButton, Full, full } from './value';

/**
 * One row, whole.
 *
 * This is the answer to the complaint that the browser cut its values: a table
 * cell is a fixed width and a row is not, so the row gets a place where width
 * is not the constraint. Every column is here — including the ones hidden from
 * the grid — at full length, pretty-printed if it is JSON, and copyable
 * individually or as a whole row.
 *
 * The foreign keys are the other half. A row is mostly ids, and an id is only
 * useful if you can follow it; each one that points at a table the panel can
 * open renders as a link that opens that table already searched for this value.
 */
export function RowDetail({
  page,
  row,
  onClose,
  onFollow,
}: {
  page: TablePage;
  row: Record<string, unknown> | null;
  onClose: () => void;
  onFollow: (table: string, value: string) => void;
}) {
  return (
    <Dialog open={row !== null} onOpenChange={(open) => !open && onClose()}>
      {row && (
        <DialogContent
          title={page.table}
          description={rowLabel(page.fields, row) ?? `${page.fields.length} columns`}
          className="max-w-2xl"
        >
          <div className="divide-border divide-y-2">
            {page.fields.map((field) => (
              <div key={field.name} className="px-4 py-3">
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-foreground font-mono text-[12px] font-semibold">
                    {field.name}
                  </span>
                  {field.primary_key && (
                    <KeyRound size={12} className="text-muted-foreground shrink-0" />
                  )}
                  <span className="text-muted-foreground/70 font-mono text-[11px]">
                    {field.type}
                    {field.nullable ? '' : ' · not null'}
                  </span>
                  <div className="ml-auto flex items-center gap-1">
                    {field.references && row[field.name] != null && (
                      <button
                        type="button"
                        onClick={() => onFollow(field.references!.table, String(row[field.name]))}
                        className="text-muted-foreground hover:text-foreground hover:bg-muted flex items-center gap-1 rounded-md px-1.5 py-1 text-[12px] font-medium transition-colors"
                      >
                        {field.references.table}
                        <ArrowUpRight size={13} />
                      </button>
                    )}
                    {row[field.name] != null && (
                      <CopyButton
                        value={full(row[field.name], field)}
                        label={`Copy ${field.name}`}
                      />
                    )}
                  </div>
                </div>
                <div className="text-body">
                  <Full value={row[field.name]} field={field} />
                </div>
              </div>
            ))}
          </div>

          <div className="border-border flex items-center justify-between gap-3 border-t-2 px-4 py-3">
            <p className="text-footnote text-muted-foreground">
              {page.redacted.length > 0
                ? `Withheld: ${page.redacted.join(', ')}`
                : 'Every column of this table.'}
            </p>
            <CopyButton value={JSON.stringify(row, null, 2)} label="Copy the whole row as JSON" />
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}

/**
 * The most identifying thing about a row, for the dialog's subtitle.
 *
 * Preference order is what a person would say out loud about the row — its
 * name, its email, what it says — before falling back to the key, which is
 * accurate and tells nobody anything.
 */
function rowLabel(fields: TableField[], row: Record<string, unknown>): string | null {
  const preferred = ['email', 'name', 'title', 'description', 'subject', 'key', 'model'];
  for (const candidate of preferred) {
    const value = row[candidate];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.length > 90 ? `${value.slice(0, 90)}…` : value;
    }
  }
  const key = fields.find((field) => field.primary_key);
  return key && row[key.name] != null ? `${key.name} ${String(row[key.name])}` : null;
}
