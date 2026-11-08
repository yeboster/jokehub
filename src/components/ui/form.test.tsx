import { act, Component, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Form, FormControl, FormField, FormItem, FormLabel } from './form';

class Boundary extends Component<{ children: ReactNode; onError: (message: string) => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { this.props.onError(error.message); }
  render() { return this.state.failed ? null : this.props.children; }
}

type Values = { name: string };
function Harness({ children }: { children: (form: UseFormReturn<Values>) => ReactNode }) {
  const form = useForm<Values>();
  return <Form {...form}>{children(form)}</Form>;
}

let container: HTMLDivElement; let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('useFormField', () => {
  it('FormLabel outside FormField throws a clear error', async () => {
    const errors: string[] = [];
    await act(async () => root.render(
      <Boundary onError={message => errors.push(message)}>
        <Harness>{() => <FormItem><FormLabel>Name</FormLabel></FormItem>}</Harness>
      </Boundary>,
    ));
    expect(errors).toEqual(['useFormField should be used within <FormField>']);
  });

  it('FormLabel inside FormField links to its control', async () => {
    await act(async () => root.render(
      <Harness>{form => (
        <FormField control={form.control} name="name" render={() => (
          <FormItem><FormLabel>Name</FormLabel><FormControl><input /></FormControl></FormItem>
        )} />
      )}</Harness>,
    ));
    const label = container.querySelector('label')!;
    const input = container.querySelector('input')!;
    expect(label.htmlFor).toBe(input.id);
    expect(input.id).toMatch(/-form-item$/);
  });
});
