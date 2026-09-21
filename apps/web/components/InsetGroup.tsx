import { cn } from '@/lib/utils';

/**
 * A titled section of rows on a card.
 *
 * The card used to carry a shadow barely above the threshold of visibility, on
 * the theory that a screen of six of them would otherwise look embossed. That
 * was the right call for a system built out of hairlines; it is the wrong one
 * here. Since the glow-up it is lit rather than outlined, and six of them
 * stacked read as six objects — which is what they are.
 *
 * The title is set as an eyebrow: small, heavy, letterspaced caps. At this
 * weight the caps need the tracking or they clot.
 *
 * `icon` is the glow-up's other half. The picture beside a heading used to be
 * an emoji inside the *translated string*, which meant the platform drew it —
 * so a Mac and a Windows box showed different pictures of the same section, and
 * neither matched the palette. It is a drawing now (see <Glossy>), which is why
 * it arrives as a node here rather than as the first character of `title`.
 */
export function InsetGroup({
  title,
  icon,
  trailing,
  footer,
  className,
  children,
}: {
  title?: string;
  icon?: React.ReactNode;
  trailing?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn('space-y-2', className)}>
      {(title || trailing) && (
        <header className="flex items-baseline justify-between gap-3 px-1.5">
          {title && (
            <h2 className="text-eyebrow text-muted-foreground flex items-center gap-1.5">
              {/* Nudged down half a pixel: the icon is centred on its own box
                  and the caps beside it are not, so aligning the two boxes
                  leaves the drawing riding high. */}
              {icon && <span className="translate-y-[0.5px]">{icon}</span>}
              {title}
            </h2>
          )}
          {trailing}
        </header>
      )}
      <div className="bg-card border-hairline divide-hairline chunk divide-y overflow-hidden rounded-[var(--radius)] border">
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
