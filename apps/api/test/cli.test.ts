import { describe, expect, it, vi } from 'vitest';
import { pathToFileURL } from 'node:url';
import { isEntrypoint, runAsScript } from '../src/cli.ts';

describe('isEntrypoint', () => {
  it('is true when the module is the file node was asked to run', () => {
    expect(isEntrypoint(pathToFileURL('/srv/app/seed.ts').href, ['node', '/srv/app/seed.ts'])).toBe(true);
  });

  it('is false when the module was merely imported', () => {
    expect(isEntrypoint(pathToFileURL('/srv/app/seed.ts').href, ['node', '/srv/app/other.ts'])).toBe(false);
  });

  it('is false when there is no entry argument at all', () => {
    expect(isEntrypoint('file:///srv/app/seed.ts', ['node'])).toBe(false);
  });
});

describe('runAsScript', () => {
  it('runs the body and then tears down', async () => {
    const order: string[] = [];
    await runAsScript(
      async () => void order.push('main'),
      async () => void order.push('teardown'),
    );
    expect(order).toEqual(['main', 'teardown']);
    expect(process.exitCode).toBeFalsy();
  });

  it('reports a failure as one line and still tears down', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const teardown = vi.fn(async () => {});
    const original = process.exitCode;

    try {
      await runAsScript(async () => {
        throw new Error('no such account');
      }, teardown);

      expect(error).toHaveBeenCalledWith('no such account');
      expect(error).not.toHaveBeenCalledWith(expect.stringContaining('at '));
      expect(teardown).toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = original;
      error.mockRestore();
    }
  });

  it('handles a thrown non-Error', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const original = process.exitCode;
    try {
      await runAsScript(async () => {
        throw 'just a string';
      }, async () => {});
      expect(error).toHaveBeenCalledWith('just a string');
    } finally {
      process.exitCode = original;
      error.mockRestore();
    }
  });
});
