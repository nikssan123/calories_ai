import { cn } from '@/lib/utils';

/**
 * A titled section of rows on a card.
 *
 * The card used to carry a shadow barely above the threshold of visibility, on
 * the theory that a screen of six of them would otherwise look embossed. That
 * was the right call for a system built out of hairlines; it is the wrong one
 * here. Now it has a real outline and a real ledge, and six of them stacked
 * read as six objects — which is what they are.
 *
 * The title is set as an eyebrow: small, heavy, letterspaced caps. At this
 * weight the caps need the tracking or they clot.
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
        <header className="flex items-baseline justify-between gap-3 px-1.5">
          {title && <h2 className="text-eyebrow text-muted-foreground">{title}</h2>}
          {trailing}
        </header>
      )}
      <div className="bg-card border-border divide-border chunk divide-y-2 overflow-hidden rounded-[var(--radius)] border-2">
        {children}
      </div>
      {footer && (
        <p className="text-footnote text-muted-foreground px-1.5 pt-0.5 font-medium">{footer}</p>
      )}
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
