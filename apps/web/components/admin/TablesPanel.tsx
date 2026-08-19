'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import type { TablePage, TableSummary } from '@ct/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Cell, DataTable } from './DataTable';
import { bytes, compactNumber } from './format';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 50;

/**
 * A read-only window onto the database.
 *
 * Read-only in the strong sense: there is no write path on the server, so
 * nothing here can be turned into one by a change on this side. The table list
 * is an allowlist held by the API, and two columns — password hashes and
 * session tokens — are withheld from it entirely rather than merely hidden in
 * the markup.
 */
export function TablesPanel() {
  const [tables, setTables] = useState<TableSummary[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [page, setPage] = useState<TablePage | null>(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    void (async () => {
      try {
        const { tables: list } = await api.admin.tables();
        setTables(list);
        setSelected((current) => current ?? list[0]?.name ?? null);
      } catch (e) {
        toast.error((e as Error).message);
      }
    })();
  }, []);

  const load = useCallback(async (table: string, at: number) => {
    try {
      setPage(await api.admin.table(table, { limit: PAGE_SIZE, offset: at }));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (selected) void load(selected, offset);
  }, [selected, offset, load]);

  if (!tables) return <Skeleton className="h-64 w-full rounded-2xl" />;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-title-2">Database</h2>
        <p className="text-footnote text-muted-foreground mt-0.5">
          Read-only. Password hashes and session tokens are never sent to this page.
        </p>
      </div>

      {/* Horizontal on a phone, wrapping on a desktop — a dozen tables is more
          than a tab bar handles but fewer than a sidebar deserves. */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {tables.map((table) => (
          <button
            key={table.name}
            type="button"
            onClick={() => {
              setSelected(table.name);
              setOffset(0);
              setPage(null);
            }}
            className={cn(
              'shrink-0 rounded-lg px-3 py-1.5 text-left transition-colors',
              selected === table.name
                ? 'bg-primary text-primary-foreground'
                : 'bg-card hover:bg-muted',
            )}
          >
            <span className="block text-[13px] font-medium">{table.name}</span>
            <span
              className={cn(
                'tnum block text-[11px]',
                selected === table.name ? 'opacity-70' : 'text-muted-foreground',
              )}
            >
              {compactNumber(table.rows)} rows · {bytes(table.bytes)}
            </span>
          </button>
        ))}
      </div>

      {!page ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : (
        <>
          {page.redacted.length > 0 && (
            <p className="text-footnote text-muted-foreground flex items-center gap-1.5">
              <EyeOff size={14} />
              Withheld: {page.redacted.join(', ')}
            </p>
          )}

          <DataTable columns={page.columns} empty="This table is empty.">
            {page.rows.map((row, index) => (
              <tr key={String(row.id ?? row.name ?? index)}>
                {page.columns.map((column) => (
                  <Cell key={column} className="max-w-[22rem] truncate">
                    <CellValue value={row[column]} />
                  </Cell>
                ))}
              </tr>
            ))}
          </DataTable>

          <div className="flex items-center justify-between">
            <p className="text-footnote text-muted-foreground tnum">
              {page.total === 0
                ? 'No rows'
                : `${offset + 1}–${Math.min(offset + PAGE_SIZE, page.total)} of ${compactNumber(page.total)}`}
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                <ChevronLeft size={15} /> Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={offset + PAGE_SIZE >= page.total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                Next <ChevronRight size={15} />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Renders whatever a column happens to hold without letting JSON blow the row up. */
function CellValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">null</span>;
  }
  if (typeof value === 'boolean') {
    return <span className={value ? 'text-[var(--protein)]' : 'text-muted-foreground'}>{String(value)}</span>;
  }
  if (typeof value === 'number') return <span className="tnum">{value}</span>;
  if (typeof value === 'object') {
    const json = JSON.stringify(value);
    return (
      <span className="text-muted-foreground" title={json}>
        {json.length > 60 ? `${json.slice(0, 60)}…` : json}
      </span>
    );
  }
  return <span title={String(value)}>{String(value)}</span>;
}
