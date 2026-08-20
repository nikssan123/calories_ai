import { cn } from '@/lib/utils';

/**
 * A titled section of rows on a floating card.
 *
 * The card carries a shadow barely above the threshold of visibility — enough
 * that it reads as sitting on the warm ground rather than being cut out of it,
 * not so much that a screen of six of them looks embossed.
 */
export function InsetGroup({
  title,
  trailing,
  footer,
  className,
  children,
}: {
  title?: string;
  trailing?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn('space-y-2.5', className)}>
      {(title || trailing) && (
        <header className="flex items-baseline justify-between px-1">
          {title && (
            <h2 className="text-footnote text-muted-foreground font-semibold tracking-wide uppercase">
              {title}
            </h2>
          )}
          {trailing}
        </header>
      )}
      <div className="bg-card divide-border divide-y overflow-hidden rounded-[var(--radius)] shadow-[0_1px_2px_rgba(23,22,20,0.05)]">
        {children}
      </div>
      {footer && <p className="text-footnote text-muted-foreground px-1">{footer}</p>}
    </section>
  );
}

export function InsetRow({ className, children, ...props }: React.ComponentProps<'div'>) {
  return (
    <div className={cn('flex items-center gap-3 px-4 py-3.5', className)} {...props}>
      {children}
    </div>
  );
}
