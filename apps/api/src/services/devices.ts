import { createHash } from 'node:crypto';
import { queryOne } from '../db.ts';

/**
 * "Have I seen this thing sign in before?"
 *
 * The answer decides whether a sign-in is worth emailing about, and the value
 * of that email rests entirely on it being rare. An alert that arrives every
 * Tuesday is one people filter, and a filtered alert is worse than none — it is
 * the one that will not be read on the day it matters.
 *
 * So the fingerprint is the user agent and nothing else. Not the IP: home
 * broadband, a phone on mobile data and a café's wifi are the same person on
 * the same laptop, and folding the address in would fire on every commute. Not
 * a cookie either — a session cookie is cleared by the same people most likely
 * to worry about this, and clearing it should not cost them an alert.
 *
 * What this deliberately does not claim to be is a security boundary. A user
 * agent is self-reported and trivially copied. It is a heuristic for *is this
 * worth mentioning*, and the mention is what does the work: the person reading
 * it knows whether they own a Windows machine.
 */

export interface DeviceSighting {
  /** True the first time this account is seen using this kind of client. */
  isNew: boolean;
  /** Something a person can recognise, for the email. */
  label: string;
}

export async function rememberDevice(
  userId: string,
  userAgent: string | undefined,
  ip: string | null,
): Promise<DeviceSighting> {
  const agent = userAgent?.slice(0, 400) ?? '';
  const hash = createHash('sha256').update(agent).digest('hex');

  /*
   * One statement, so two simultaneous sign-ins cannot both decide they are the
   * first. `xmax = 0` is Postgres' way of saying this row was inserted rather
   * than updated by the ON CONFLICT — the tuple has no transaction that
   * superseded a previous version, because there was no previous version.
   */
  const row = await queryOne<{ inserted: boolean }>(
    `INSERT INTO known_devices (user_id, device_hash, user_agent, last_ip)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id, device_hash)
     DO UPDATE SET last_seen_at = now(), last_ip = EXCLUDED.last_ip
     RETURNING (xmax = 0) AS inserted`,
    [userId, hash, agent || null, ip],
  );

  return { isNew: row?.inserted === true, label: describeDevice(agent) };
}

/**
 * A user agent, in words.
 *
 * Deliberately coarse. The point is for someone to read "Safari on iPhone" and
 * know whether they own one — a version number adds nothing to that judgement
 * and makes the line harder to scan. Order matters in both tables below: Edge
 * and Chrome both claim to be Safari, and Android claims to be Linux.
 */
export function describeDevice(userAgent: string): string {
  if (!userAgent.trim()) return 'an unrecognised device';

  const browsers: Array<[RegExp, string]> = [
    // Our own client first. It is a webview, so it will happily also claim to
    // be Safari, and "the Day So Far app" is the more useful of the two facts.
    [/\bDaySoFar\//, 'the Day So Far app'],
    [/\bEdg\//, 'Edge'],
    [/\bOPR\//, 'Opera'],
    [/\bFirefox\//, 'Firefox'],
    [/\bChrome\//, 'Chrome'],
    [/\bSafari\//, 'Safari'],
  ];
  const systems: Array<[RegExp, string]> = [
    [/\biPhone\b/, 'iPhone'],
    [/\biPad\b/, 'iPad'],
    [/\bAndroid\b/, 'Android'],
    [/\bMac OS X\b|\bMacintosh\b/, 'macOS'],
    [/\bWindows\b/, 'Windows'],
    [/\bCrOS\b/, 'ChromeOS'],
    [/\bLinux\b/, 'Linux'],
  ];

  const browser = browsers.find(([pattern]) => pattern.test(userAgent))?.[1];
  const system = systems.find(([pattern]) => pattern.test(userAgent))?.[1];

  if (browser && system) return `${browser} on ${system}`;
  if (browser) return browser;
  if (system) return system;
  // Better a truncated string than a confident lie about what this was.
  return userAgent.length > 60 ? `${userAgent.slice(0, 60)}…` : userAgent;
}
