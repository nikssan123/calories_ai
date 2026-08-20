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
          <Logo size={52} className="mb-5" />
          <h1 className="text-large-title">{title}</h1>
          {subtitle && <p className="text-muted-foreground mt-2.5 text-body">{subtitle}</p>}
        </div>
        {children}
        {footer && <div className="text-muted-foreground mt-6 text-center text-sm">{footer}</div>}
      </div>
    </div>
  );
}

/**
 * The one field shape these screens use, matching the sign-in form.
 *
 * These carry a real 2px outline. In the old hairline system a white field on
 * the cream ground was distinct enough on its own and the border was explicitly
 * removed; in a system where every other surface has an edge, a borderless
 * field is the one thing on the page that looks unfinished.
 */
export const AUTH_FIELD = 'bg-card border-border chunk h-12 rounded-[1.125rem] border-2 text-body';
export const AUTH_BUTTON = 'h-12 w-full rounded-2xl text-base font-extrabold';
