import { Logo } from '@/components/Logo';

/**
 * The centred column the sign-in screen uses, shared by the screens reached
 * from a link in an email.
 *
 * They are all the same shape — mark, one sentence saying where you are, one
 * thing to do — and the reason to factor it out is not brevity: someone arrives
 * at `/reset` from a mailbox with no idea whether the link they clicked was
 * real, and the strongest signal that it was is that the page looks exactly
 * like the one they sign in on.
 */
export function AuthScreen({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center px-6 py-12">
        <div className="mb-8">
          <Logo size={46} className="mb-5" />
          <h1 className="text-large-title">{title}</h1>
          {subtitle && <p className="text-muted-foreground mt-2 text-[15px]">{subtitle}</p>}
        </div>
        {children}
        {footer && <div className="text-muted-foreground mt-6 text-center text-sm">{footer}</div>}
      </div>
    </div>
  );
}

/** The one field shape these screens use, matching the sign-in form. */
export const AUTH_FIELD = 'bg-card h-12 rounded-xl border-0 text-[15px]';
export const AUTH_BUTTON = 'h-12 w-full rounded-2xl text-[15px] font-semibold';
