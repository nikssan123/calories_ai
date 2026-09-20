'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  EyeOff,
  KeyRound,
  RefreshCw,
  Search,
  Table2,
  Text,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import type { AdminUser, TableField, TablePage, TableSummary } from '@ct/shared';
import { TABLE_GROUPS } from '@ct/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { RowDetail } from './RowDetail';
import { bytes, compactNumber } from './format';
import { Inline, isNumeric } from './value';
import { cn } from '@/lib/utils';

const PAGE_SIZES = [25, 50, 100, 250] as const;

/** How many columns a phone's row card summarises before you open the row. */
const CARD_FIELDS = 6;

/**
 * A read-only window onto the database.
 *
 * Read-only in the strong sense: there is no write path on the server, so
 * nothing here can be turned into one by a change on this side. The table list
 * is an allowlist held by the API, and the columns that are credentials —
 * password hashes, session tokens, push tokens — are withheld from it entirely
 * rather than merely hidden in the markup.
 *
 * The shape of the screen follows what goes wrong when you use it. Forty tables
 * do not fit in a scrolling strip, so they are a grouped and filterable list.
 * Values were being cut at a fixed cell width, so a row now opens whole. And
 * you almost never want a table — you want a table *about somebody*, so the
 * account filter sits above the picker and survives moving between tables.
 *
 * On a phone the same three answers are drawn differently, because a grid of
 * forty columns on a 390-pixel screen is something you scroll sideways forever
 * and read nothing from. The table list collapses to the name of the table you
 * are in, the rows become cards that open into the same inspector, and sorting
 * — which on a wide screen lives in the column headers the cards do not have —
 * gets a control of its own in the toolbar.
 */
export function TablesPanel() {
  const [tables, setTables] = useState<TableSummary[] | null>(null);
  const [accounts, setAccounts] = useState<AdminUser[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [page, setPage] = useState<TablePage | null>(null);
  const [loading, setLoading] = useState(false);

  // Query state. Everything here is a server round trip, which is why the
  // search box below keeps its own draft rather than driving this directly.
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState<number>(50);
  const [search, setSearch] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [sort, setSort] = useState<{ column: string; dir: 'asc' | 'desc' } | null>(null);

  // View state — free, and none of it survives changing table.
  const [tableFilter, setTableFilter] = useState('');
  // Only the phone's collapsed picker reads this; the `lg` sidebar is always open.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [wrap, setWrap] = useState(false);
  const [showColumns, setShowColumns] = useState(false);
  const [hidden, setHidden] = useState<string[]>([]);
  const [inspecting, setInspecting] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [{ tables: list }, { users }] = await Promise.all([
          api.admin.tables(),
          api.admin.users(500),
        ]);
        setTables(list);
        setAccounts(users);
        setSelected((current) => current ?? list[0]?.name ?? null);
      } catch (e) {
        toast.error((e as Error).message);
      }
    })();
  }, []);

  const load = useCallback(async () => {
    if (!selected) return;
    setLoading(true);
    try {
      setPage(
        await api.admin.table(selected, {
          limit,
          offset,
          userId: userId ?? undefined,
          q: search || undefined,
          sort: sort?.column,
          dir: sort?.dir,
        }),
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [selected, limit, offset, userId, search, sort]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Changing table resets everything that only made sense against the old one. */
  const open = useCallback((table: string, query = '') => {
    setSelected(table);
    setOffset(0);
    setSearch(query);
    setSort(null);
    setHidden([]);
    setShowColumns(false);
    setInspecting(null);
    setPage(null);
    setPickerOpen(false);
  }, []);

  /** The toolbar's sort control, which names a column rather than cycling one. */
  const chooseSort = useCallback((next: { column: string; dir: 'asc' | 'desc' } | null) => {
    setSort(next);
    setOffset(0);
  }, []);

  const visible = useMemo(
    () => (page?.fields ?? []).filter((field) => !hidden.includes(field.name)),
    [page, hidden],
  );

  if (!tables) return <Skeleton className="h-96 w-full rounded-2xl" />;

  const totalRows = tables.reduce((sum, table) => sum + table.rows, 0);
  const totalBytes = tables.reduce((sum, table) => sum + table.bytes, 0);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-title-2">Database</h2>
        <p className="text-footnote text-muted-foreground mt-0.5">
          {tables.length} tables · {compactNumber(totalRows)} rows · {bytes(totalBytes)}. Read-only,
          and password hashes, session tokens and push tokens are never sent to this page.
        </p>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <TablePicker
          tables={tables}
          selected={selected}
          filter={tableFilter}
          onFilter={setTableFilter}
          onSelect={(name) => open(name)}
          open={pickerOpen}
          onOpen={setPickerOpen}
        />

        <div className="min-w-0 flex-1 space-y-3">
          <Toolbar
            accounts={accounts}
            userId={userId}
            onUserId={(id) => {
              setUserId(id);
              setOffset(0);
            }}
            search={search}
            onSearch={(value) => {
              setSearch(value);
              setOffset(0);
            }}
            limit={limit}
            onLimit={(value) => {
              setLimit(value);
              setOffset(0);
            }}
            fields={page?.fields ?? []}
            sort={sort}
            onSort={chooseSort}
            wrap={wrap}
            onWrap={setWrap}
            columnsOpen={showColumns}
            onColumns={() => setShowColumns((open) => !open)}
            hiddenCount={hidden.length}
            onRefresh={() => void load()}
            loading={loading}
          />

          {showColumns && page && (
            <ColumnToggles
              fields={page.fields}
              hidden={hidden}
              onToggle={(name) =>
                setHidden((current) =>
                  current.includes(name)
                    ? current.filter((entry) => entry !== name)
                    : [...current, name],
                )
              }
              onAll={() => setHidden([])}
            />
          )}

          {!page ? (
            <Skeleton className="h-96 w-full rounded-2xl" />
          ) : (
            <>
              <div className="text-footnote text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>{page.note}</span>
                {page.redacted.length > 0 && (
                  <span className="flex items-center gap-1">
                    <EyeOff size={13} />
                    {page.redacted.join(', ')} withheld
                  </span>
                )}
                {userId && !page.user_id && (
                  <span className="text-[var(--protein-text)]">
                    No user_id here — the account filter does not apply.
                  </span>
                )}
              </div>

              {page.rows.length === 0 ? (
                <NoRows page={page} />
              ) : (
                <>
                  <RowCards
                    page={page}
                    fields={visible}
                    offset={offset}
                    sortColumn={sort?.column ?? null}
                    onInspect={setInspecting}
                  />

                  <Grid
                    page={page}
                    fields={visible}
                    offset={offset}
                    wrap={wrap}
                    sort={sort}
                    onSort={(column) => {
                      setSort((current) =>
                        current?.column === column
                          ? current.dir === 'desc'
                            ? { column, dir: 'asc' }
                            : null
                          : { column, dir: 'desc' },
                      );
                      setOffset(0);
                    }}
                    onInspect={setInspecting}
                  />
                </>
              )}

              <Pager
                total={page.total}
                offset={offset}
                limit={limit}
                filtered={Boolean(page.q || page.user_id)}
                onOffset={setOffset}
              />
            </>
          )}
        </div>
      </div>

      {page && (
        <RowDetail
          page={page}
          row={inspecting}
          onClose={() => setInspecting(null)}
          onFollow={(table, value) => open(table, value)}
        />
      )}
    </div>
  );
}

/**
 * The table list, grouped the way the allowlist groups it.
 *
 * Grouped rather than alphabetical because the question is almost never "what
 * is the table called" — it is "where does the app keep workouts", and the
 * answer to that is a shelf. The filter box is there for when you do know the
 * name, and matches the group as well so typing "ops" narrows to plumbing.
 *
 * On a wide screen it is a sidebar and is simply always open. On a phone that
 * same list is four hundred pixels of chrome sitting between you and the rows
 * you came to read, and you cross it on every single visit — so there it
 * collapses to the name of the table you are already in, and opening it is the
 * deliberate act of going somewhere else.
 */
function TablePicker({
  tables,
  selected,
  filter,
  onFilter,
  onSelect,
  open,
  onOpen,
}: {
  tables: TableSummary[];
  selected: string | null;
  filter: string;
  onFilter: (value: string) => void;
  onSelect: (name: string) => void;
  open: boolean;
  onOpen: (value: boolean) => void;
}) {
  const needle = filter.trim().toLowerCase();
  const matches = tables.filter(
    (table) =>
      !needle ||
      table.name.includes(needle) ||
      table.group.toLowerCase().includes(needle),
  );
  const current = tables.find((table) => table.name === selected) ?? null;

  return (
    <div className="bg-card border-hairline chunk w-full shrink-0 overflow-hidden rounded-2xl border lg:w-64">
      <button
        type="button"
        onClick={() => onOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-3 text-left lg:hidden"
      >
        <Table2 size={16} className="text-muted-foreground shrink-0" />
        <span className="min-w-0 flex-1 truncate font-mono text-[14px] font-semibold">
          {current?.name ?? 'Pick a table'}
        </span>
        {current && (
          <span className="text-muted-foreground tnum shrink-0 text-[12px]">
            {compactNumber(current.rows)} rows
          </span>
        )}
        <ChevronDown
          size={16}
          className={cn(
            'text-muted-foreground shrink-0 transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      <div className={cn('lg:block', open ? 'block' : 'hidden')}>
        <div className="border-hairline relative border-y lg:border-t-0">
          <Search
            size={15}
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
          />
          {/* 16px on a phone on purpose: iOS zooms the whole page in on a focused
              field set any smaller, and it does not zoom back out. */}
          <input
            value={filter}
            onChange={(event) => onFilter(event.target.value)}
            placeholder="Find a table"
            aria-label="Find a table"
            className="text-body placeholder:text-muted-foreground w-full bg-transparent py-3 pr-3 pl-9 outline-none lg:py-2.5"
          />
        </div>

        <div className="max-h-[20rem] overflow-y-auto lg:max-h-[36rem]">
          {matches.length === 0 && (
            <p className="text-muted-foreground px-3 py-6 text-center text-body">
              No table matches “{filter}”.
            </p>
          )}
          {TABLE_GROUPS.map((group) => {
            const rows = matches.filter((table) => table.group === group);
            if (rows.length === 0) return null;
            return (
              <div key={group}>
                <p className="text-eyebrow text-muted-foreground bg-muted-field px-3 py-1.5">
                  {group}
                </p>
                {rows.map((table) => (
                  <button
                    key={table.name}
                    type="button"
                    onClick={() => onSelect(table.name)}
                    aria-current={selected === table.name ? 'true' : undefined}
                    className={cn(
                      'flex w-full items-baseline justify-between gap-2 px-3 py-2.5 text-left transition-colors lg:py-2',
                      selected === table.name
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-muted',
                    )}
                  >
                    <span className="truncate font-mono text-[13px] font-medium">{table.name}</span>
                    <span
                      className={cn(
                        'tnum shrink-0 text-[11px]',
                        selected === table.name ? 'opacity-70' : 'text-muted-foreground',
                      )}
                      title={bytes(table.bytes)}
                    >
                      {compactNumber(table.rows)}
                    </span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * The controls that change what the grid holds.
 *
 * The search box keeps a draft and commits on submit rather than on every
 * keystroke: the server search is a sequential scan across every column cast to
 * text, and firing one per letter would be a scan per letter.
 *
 * Two rows on a phone rather than one wrapping one. Search is the control you
 * reach for, so it gets the full width and is never the thing that got pushed
 * onto the third line; the filters follow underneath. Every field is 16px and
 * 40px tall down there — anything smaller and iOS zooms the page in the moment
 * you focus it, and anything shorter is a miss under a thumb.
 */
function Toolbar({
  accounts,
  userId,
  onUserId,
  search,
  onSearch,
  limit,
  onLimit,
  fields,
  sort,
  onSort,
  wrap,
  onWrap,
  columnsOpen,
  onColumns,
  hiddenCount,
  onRefresh,
  loading,
}: {
  accounts: AdminUser[];
  userId: string | null;
  onUserId: (id: string | null) => void;
  search: string;
  onSearch: (value: string) => void;
  limit: number;
  onLimit: (value: number) => void;
  fields: TableField[];
  sort: { column: string; dir: 'asc' | 'desc' } | null;
  onSort: (next: { column: string; dir: 'asc' | 'desc' } | null) => void;
  wrap: boolean;
  onWrap: (value: boolean) => void;
  columnsOpen: boolean;
  onColumns: () => void;
  hiddenCount: number;
  onRefresh: () => void;
  loading: boolean;
}) {
  const [draft, setDraft] = useState(search);
  const committed = useRef(search);

  // Only follow the parent when it changed the search itself — following a
  // foreign key sets it — so typing is never overwritten mid-word.
  useEffect(() => {
    if (search !== committed.current) {
      committed.current = search;
      setDraft(search);
    }
  }, [search]);

  const commit = (value: string) => {
    committed.current = value;
    onSearch(value);
  };

  const control =
    'field border-hairline h-10 rounded-lg border px-2 text-base sm:h-9 sm:text-[0.9rem]';

  return (
    <div className="space-y-2">
      <form
        className="relative"
        onSubmit={(event) => {
          event.preventDefault();
          commit(draft.trim());
        }}
      >
        <Search
          size={15}
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
        />
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Search every column…"
          aria-label="Search this table"
          className="h-10 rounded-lg pr-9 pl-9 sm:h-9"
        />
        {draft && (
          <button
            type="button"
            aria-label="Clear the search"
            onClick={() => {
              setDraft('');
              commit('');
            }}
            className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-1.5"
          >
            <X size={14} />
          </button>
        )}
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={userId ?? ''}
          onChange={(event) => onUserId(event.target.value || null)}
          aria-label="Filter to one account"
          className={cn(control, 'min-w-0 flex-1 sm:max-w-[13rem] sm:flex-none')}
        >
          <option value="">Every account</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.email ?? account.display_name ?? account.id}
            </option>
          ))}
        </select>

        <select
          value={limit}
          onChange={(event) => onLimit(Number(event.target.value))}
          aria-label="Rows per page"
          className={cn(control, 'tnum shrink-0')}
        >
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size} rows
            </option>
          ))}
        </select>

        {/* Wrap is a property of table cells, and on a phone there are none. */}
        <Button
          variant={wrap ? 'default' : 'secondary'}
          onClick={() => onWrap(!wrap)}
          title="Let long values wrap over several lines"
          className="hidden lg:inline-flex"
        >
          <Text size={15} /> Wrap
        </Button>

        <Button
          variant={columnsOpen ? 'default' : 'secondary'}
          onClick={onColumns}
          title="Choose which columns the grid shows"
          className="h-10 sm:h-9"
        >
          <Columns3 size={15} /> Columns{hiddenCount > 0 ? ` (${hiddenCount})` : ''}
        </Button>

        <Button
          variant="secondary"
          onClick={onRefresh}
          aria-label="Reload"
          className="h-10 w-10 shrink-0 p-0 sm:h-9 sm:w-9"
        >
          <RefreshCw size={15} className={cn(loading && 'animate-spin')} />
        </Button>
      </div>

      {/* The grid sorts from its column headers. The cards have no headers, so
          below `lg` the same control has to exist somewhere it can be seen. */}
      {fields.length > 0 && (
        <div className="flex items-center gap-2 lg:hidden">
          <ArrowUpDown size={15} className="text-muted-foreground shrink-0" />
          <select
            value={sort?.column ?? ''}
            onChange={(event) =>
              onSort(
                event.target.value ? { column: event.target.value, dir: sort?.dir ?? 'desc' } : null,
              )
            }
            aria-label="Sort by"
            className={cn(control, 'min-w-0 flex-1')}
          >
            <option value="">Default order</option>
            {fields.map((field) => (
              <option key={field.name} value={field.name}>
                {field.name}
              </option>
            ))}
          </select>
          <Button
            variant="secondary"
            disabled={!sort}
            onClick={() =>
              sort && onSort({ column: sort.column, dir: sort.dir === 'desc' ? 'asc' : 'desc' })
            }
            title="Reverse the order"
            className="h-10 shrink-0"
          >
            {sort?.dir === 'asc' ? <ArrowUp size={15} /> : <ArrowDown size={15} />}
            {sort?.dir === 'asc' ? 'Asc' : 'Desc'}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Which columns the grid shows. Hiding four ids is what makes a wide table readable. */
function ColumnToggles({
  fields,
  hidden,
  onToggle,
  onAll,
}: {
  fields: TableField[];
  hidden: string[];
  onToggle: (name: string) => void;
  onAll: () => void;
}) {
  return (
    <div className="bg-card border-hairline flex flex-wrap items-center gap-1.5 rounded-2xl border p-3">
      {fields.map((field) => {
        const off = hidden.includes(field.name);
        return (
          <button
            key={field.name}
            type="button"
            onClick={() => onToggle(field.name)}
            className={cn(
              'rounded-full px-3 py-2 font-mono text-[12px] transition-colors lg:px-2.5 lg:py-1',
              off
                ? 'text-muted-foreground/70 bg-muted line-through'
                : 'bg-primary text-primary-foreground',
            )}
          >
            {field.name}
          </button>
        );
      })}
      {hidden.length > 0 && (
        <button
          type="button"
          onClick={onAll}
          className="text-muted-foreground hover:text-foreground ml-1 text-[12px] font-semibold underline"
        >
          show all
        </button>
      )}
    </div>
  );
}

/** Nothing came back — the same sentence on both layouts. */
function NoRows({ page }: { page: TablePage }) {
  return (
    <div className="bg-card border-hairline chunk rounded-2xl border px-4 py-10 text-center">
      <p className="text-body font-medium">
        {page.q || page.user_id ? 'Nothing matches that filter.' : 'This table is empty.'}
      </p>
      {page.q && (
        <p className="text-muted-foreground mt-1 text-body">
          Searched every column of {page.table} for “{page.q}”.
        </p>
      )}
    </div>
  );
}

/**
 * The rows, on a phone.
 *
 * A grid is the right shape for a table only while the table fits on the
 * screen, and none of these do: forty columns at 390 pixels is a window you
 * drag sideways past six ids to reach the one column you wanted, having lost
 * the header on the way. So below `lg` the row — which is the unit you came
 * for — becomes the card, and it shows the head of the row rather than all of
 * it, because the inspector behind a tap already holds every column at full
 * length and there is no second thing to build.
 *
 * The sorted column is pulled into that head whatever its position. Ordering by
 * `created_at` and then seeing six columns that are not `created_at` is the one
 * way a summary can be actively misleading rather than merely partial.
 */
function RowCards({
  page,
  fields,
  offset,
  sortColumn,
  onInspect,
}: {
  page: TablePage;
  fields: TableField[];
  offset: number;
  sortColumn: string | null;
  onInspect: (row: Record<string, unknown>) => void;
}) {
  const head = useMemo(() => {
    const first = fields.slice(0, CARD_FIELDS);
    if (!sortColumn || first.some((field) => field.name === sortColumn)) return first;
    const sorted = fields.find((field) => field.name === sortColumn);
    return sorted ? [...first.slice(0, CARD_FIELDS - 1), sorted] : first;
  }, [fields, sortColumn]);

  const rest = fields.length - head.length;

  return (
    <div className="space-y-2 lg:hidden">
      {page.rows.map((row, index) => (
        <button
          key={rowKey(page, row, index)}
          type="button"
          onClick={() => onInspect(row)}
          className="bg-card border-hairline chunk block w-full rounded-2xl border px-4 py-3 text-left"
        >
          <dl className="space-y-1.5">
            {head.map((field) => (
              <div key={field.name} className="flex items-baseline gap-2">
                <dt
                  className={cn(
                    'w-24 shrink-0 truncate font-mono text-[11px]',
                    field.name === sortColumn ? 'text-foreground font-semibold' : 'text-muted-foreground',
                  )}
                >
                  {field.name}
                </dt>
                <dd className="min-w-0 flex-1 truncate text-[13px]">
                  <Inline value={row[field.name]} field={field} />
                </dd>
              </div>
            ))}
          </dl>

          <p className="text-muted-foreground mt-2 flex items-center justify-between gap-2 text-[12px] font-medium">
            <span className="tnum">Row {offset + index + 1}</span>
            <span>
              {rest > 0 ? `${rest} more column${rest === 1 ? '' : 's'} — tap to open` : 'Tap to open'}
            </span>
          </p>
        </button>
      ))}
    </div>
  );
}

/**
 * The rows.
 *
 * Two things make this readable that the old grid did not do. The header is
 * sticky inside its own scroll box, so scrolling down a hundred rows does not
 * cost you the column names; and the row number column is sticky to the left,
 * so scrolling a forty-column table sideways leaves you something to hold on
 * to. Cells are still one line by default — a grid of paragraphs is not a grid
 * — but "wrap" and the row inspector both exist, so nothing is unreadable.
 *
 * From `lg` up only: `RowCards` above is what a phone gets instead.
 */
function Grid({
  page,
  fields,
  offset,
  wrap,
  sort,
  onSort,
  onInspect,
}: {
  page: TablePage;
  fields: TableField[];
  offset: number;
  wrap: boolean;
  sort: { column: string; dir: 'asc' | 'desc' } | null;
  onSort: (column: string) => void;
  onInspect: (row: Record<string, unknown>) => void;
}) {
  return (
    <div className="bg-card border-hairline chunk hidden overflow-hidden rounded-2xl border lg:block">
      <div className="max-h-[34rem] overflow-auto">
        <table className="w-full min-w-max border-collapse text-left">
          <thead className="sticky top-0 z-20">
            <tr>
              <th className="bg-card border-hairline text-eyebrow text-muted-foreground sticky left-0 z-10 border-b px-3 py-2 text-right">
                #
              </th>
              {fields.map((field) => {
                const active = sort?.column === field.name;
                return (
                  <th
                    key={field.name}
                    className="bg-card border-hairline border-b px-3 py-1.5 align-bottom whitespace-nowrap"
                  >
                    <button
                      type="button"
                      onClick={() => onSort(field.name)}
                      title={`Sort by ${field.name}`}
                      className="flex flex-col items-start gap-0.5"
                    >
                      {/* Verbatim, in mono: these are the column names you would
                          type into psql, and upper-casing them is a small lie. */}
                      <span
                        className={cn(
                          'flex items-center gap-1 font-mono text-[12px] font-semibold',
                          active ? 'text-foreground' : 'text-muted-foreground',
                        )}
                      >
                        {field.primary_key && <KeyRound size={11} />}
                        {field.name}
                        {active &&
                          (sort.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                      </span>
                      <span className="text-muted-foreground/60 font-mono text-[10px] font-medium">
                        {field.references ? `→ ${field.references.table}` : field.type}
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-hairline divide-y">
            {page.rows.map((row, index) => (
              <tr
                key={rowKey(page, row, index)}
                onClick={() => onInspect(row)}
                className="group hover:bg-muted cursor-pointer"
              >
                {/* The row number is also the keyboard way in: a `tr` with an
                    onClick is unreachable without a mouse, and this is the one
                    control every row already has room for. */}
                <td className="bg-card group-hover:bg-muted sticky left-0 z-10 p-0 text-right">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onInspect(row);
                    }}
                    title="Open this row"
                    className="text-muted-foreground hover:text-foreground tnum w-full px-3 py-2 text-right text-[12px]"
                  >
                    {offset + index + 1}
                  </button>
                </td>
                {fields.map((field) => (
                  <td key={field.name} className="px-3 py-2 text-[13px]">
                    {/* The width lives on this div rather than on the cell: under
                        auto table layout a `max-width` on a `td` is a suggestion
                        the browser is free to ignore, and it does. */}
                    <div
                      className={cn(
                        'max-w-[26rem]',
                        isNumeric(field.type) && 'text-right',
                        wrap ? 'break-words whitespace-pre-wrap' : 'truncate',
                      )}
                    >
                      <Inline value={row[field.name]} field={field} />
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * A stable key for a row.
 *
 * The primary key where there is one, and the index where there is not —
 * `routine_days` and friends are keyed on a pair of columns, and React only
 * needs the key to be unique within the page.
 */
function rowKey(page: TablePage, row: Record<string, unknown>, index: number): string {
  const key = page.fields.find((field) => field.primary_key);
  const value = key ? row[key.name] : null;
  return value == null ? `${page.table}-${index}` : String(value);
}

function Pager({
  total,
  offset,
  limit,
  filtered,
  onOffset,
}: {
  total: number;
  offset: number;
  limit: number;
  filtered: boolean;
  onOffset: (value: number) => void;
}) {
  const last = Math.max(0, Math.floor((total - 1) / limit) * limit);

  // Two full-width buttons under the count on a phone, rather than two small
  // ones crowded against it: this is the control you press most on this screen
  // and the only one where a miss costs you a round trip.
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <p className="text-footnote text-muted-foreground tnum">
        {total === 0
          ? 'No rows'
          : `${offset + 1}–${Math.min(offset + limit, total)} of ${compactNumber(total)}`}
        {filtered && total > 0 && ' matching'}
      </p>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          className="h-10 flex-1 sm:h-8 sm:flex-none"
          disabled={offset === 0}
          onClick={() => onOffset(Math.max(0, offset - limit))}
        >
          <ChevronLeft size={15} /> Previous
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="h-10 flex-1 sm:h-8 sm:flex-none"
          disabled={offset + limit >= total}
          onClick={() => onOffset(Math.min(last, offset + limit))}
        >
          Next <ChevronRight size={15} />
        </Button>
      </div>
    </div>
  );
}
