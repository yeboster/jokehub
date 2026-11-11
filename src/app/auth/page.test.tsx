import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  signIn: vi.fn(), signUp: vi.fn(), push: vi.fn(), toast: vi.fn(),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ signIn: mocks.signIn, signUp: mocks.signUp, user: null, loading: false }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }), useSearchParams: () => new URLSearchParams() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
import AuthPage from './page';
let container: HTMLDivElement; let root: Root;

/** Sets a controlled input's value the way a user edit would. */
function type(selector: string, value: string) {
  const input = container.querySelector(selector) as HTMLInputElement;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
function button(text: string) {
  const found = [...container.querySelectorAll('button')].find(el => el.textContent?.includes(text));
  if (!found) throw new Error(`Missing button ${text}`);
  return found;
}

beforeEach(async () => {
  vi.resetAllMocks(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.signIn.mockResolvedValue(undefined); mocks.signUp.mockResolvedValue(undefined);
  container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<AuthPage />); });
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe('auth form email', () => {
  it.each([
    { mode: 'log in', call: mocks.signIn, switchMode: false },
    { mode: 'sign up', call: mocks.signUp, switchMode: true },
  ])('sends the trimmed email to $mode', async ({ call, switchMode }) => {
    if (switchMode) await act(async () => { button('Sign Up').click(); });
    await act(async () => { type('#email', '  ada@example.com  '); type('#password', 'secret1'); });
    await act(async () => { container.querySelector('form')!.requestSubmit(); });
    expect(call).toHaveBeenCalledWith('ada@example.com', 'secret1');
  });
});
