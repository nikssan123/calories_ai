import { useEffect, useState } from 'react';
import { pending, subscribe, type Intent } from '@/lib/outbox';

/**
 * What is still waiting to be sent, as a screen sees it.
 *
 * A subscription rather than a fetch, because the queue changes underneath the
 * screen twice for every meal: once when it is typed and again when it lands.
 * A Today screen holding a stale copy would draw a meal as pending after it had
 * synced, which is a worse lie than not saying anything at all.
 */
export function useOutbox(): Intent[] {
  const [intents, setIntents] = useState<Intent[]>([]);

  useEffect(() => {
    let live = true;
    void pending().then((current) => live && setIntents(current));
    const unsubscribe = subscribe((current) => live && setIntents([...current]));
    return () => {
      live = false;
      unsubscribe();
    };
  }, []);

  return intents;
}
