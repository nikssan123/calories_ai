import { cn } from '@/lib/utils';

/**
 * A plain table on a card, scrolling horizontally inside its own box.
 *
 * The horizontal scroll is the whole point: the DB browser renders whatever
 * columns a table happens to have, and without a scroll container a wide one
 * would push the page sideways and break every other screen's layout.
 */
export function DataTable({
  columns,
  children,
  empty,
  className,
}: {
  columns: string[];
  children: React.ReactNode;
  empty?: string;
  className?: string;
}) {
  const isEmpty = Array.isArray(children) ? children.length === 0 : !children;

  return (
    <div className={cn('bg-card overflow-hidden rounded-2xl', className)}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-max border-collapse text-left">
          <thead>
            <tr className="border-border border-b">
              {columns.map((column) => (
                <th
                  key={column}
                  className="text-footnote text-muted-foreground px-3 py-2 font-medium tracking-wide whitespace-nowrap uppercase"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-border divide-y">{children}</tbody>
        </table>
      </div>
      {isEmpty && (
        <p className="text-muted-foreground px-4 py-6 text-center text-[15px]">
          {empty ?? 'Nothing here yet.'}
        </p>
      )}
    </div>
  );
}

export function Cell({ className, children, ...props }: React.ComponentProps<'td'>) {
  return (
    <td className={cn('px-3 py-2 text-[14px] whitespace-nowrap', className)} {...props}>
      {children}
    </td>
  );
}
