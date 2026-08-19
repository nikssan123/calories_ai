import { cn } from '@/lib/utils';

/**
 * iOS "inset grouped" list: a titled section of rows on a floating card, with
 * hairline separators between rows rather than borders around each one.
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
    <section className={cn('space-y-2', className)}>
      {(title || trailing) && (
        <header className="flex items-baseline justify-between px-4">
          {title && (
            <h2 className="text-footnote text-muted-foreground font-medium uppercase tracking-wide">
              {title}
            </h2>
          )}
          {trailing}
        </header>
      )}
      <div className="bg-card divide-border overflow-hidden rounded-2xl divide-y">{children}</div>
      {footer && <p className="text-footnote text-muted-foreground px-4">{footer}</p>}
    </section>
  );
}

export function InsetRow({
  className,
  children,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div className={cn('flex items-center gap-3 px-4 py-3', className)} {...props}>
      {children}
    </div>
  );
}
