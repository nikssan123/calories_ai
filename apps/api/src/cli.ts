import { pathToFileURL } from 'node:url';

/**
 * Shared entrypoint plumbing for the two scripts in this package. Both need the
 * same three things — run only when invoked directly, report a failure as one
 * readable line, and close the pool afterwards — and both got them slightly
 * wrong when they each had their own copy.
 */

/** True when `moduleUrl` is the file node was asked to run. */
export function isEntrypoint(moduleUrl: string, argv: string[] = process.argv): boolean {
  const entry = argv[1];
  return Boolean(entry) && moduleUrl === pathToFileURL(entry!).href;
}

/**
 * Runs a script body. A thrown error becomes a message and a non-zero exit code
 * rather than a stack trace, and teardown runs either way.
 */
export async function runAsScript(
  main: () => Promise<void>,
  teardown: () => Promise<unknown>,
): Promise<void> {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await teardown();
  }
}
