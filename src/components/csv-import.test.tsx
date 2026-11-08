import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ auth: { user: { uid: 'u1' } as null | { uid: string } }, toast: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('next/link', () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
import CSVImport from './csv-import';

/** A reader that hands back non-string content, as `readAsText` can on a failed read. */
class NonStringReader {
  onload: ((event: { target: { result: unknown } }) => void) | null = null;
  readAsText() { this.onload?.({ target: { result: new ArrayBuffer(1) } }); }
}

let container: HTMLDivElement; let root: Root;

async function pickFile() {
  const input = container.querySelector<HTMLInputElement>('input[type=file]');
  if (!input) throw new Error('Missing file input');
  const setValue = vi.fn();
  Object.defineProperty(input, 'files', { configurable: true, value: [new File(['x'], 'a.csv', { type: 'text/csv' })] });
  Object.defineProperty(input, 'value', { configurable: true, get: () => 'C:\\fakepath\\a.csv', set: setValue });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
  await act(async () => { await Promise.resolve(); });
  return { input, setValue };
}

beforeEach(() => {
  vi.resetAllMocks(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('FileReader', NonStringReader);
  mocks.auth.user = { uid: 'u1' };
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe('CSVImport file input reset', () => {
  it('unreadable file content resets the input', async () => {
    await act(async () => root.render(<CSVImport onImport={vi.fn()} />));
    const { input, setValue } = await pickFile();
    expect(mocks.toast.mock.calls.map(([t]) => t.title)).toContain("Couldn't read that file");
    expect(setValue).toHaveBeenCalledWith('');
    expect(input.disabled).toBe(false);
  });

  it('signed-out attempt resets the input', async () => {
    mocks.auth.user = null;
    await act(async () => root.render(<CSVImport onImport={vi.fn()} />));
    const { setValue } = await pickFile();
    expect(setValue).toHaveBeenCalledWith('');
  });
});
