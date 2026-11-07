/**
 * Cross-request model cool-down, per server instance and never persisted.
 *
 * A model that fails with a fallback-eligible error cools for five minutes.
 * While cooling it moves to the end of a request's model chain, so a broken
 * default does not cost every request a timeout. A success clears it.
 */
export const MODEL_COOL_DOWN_MS = 5 * 60_000;

const coolingUntil = new Map<string, number>();
let clock: () => number = () => Date.now();

/** Tests only: replace the clock; `undefined` restores `Date.now`. */
export function setModelHealthClock(next: (() => number) | undefined): void {
  clock = next ?? (() => Date.now());
}

/** Tests only: forget every cool-down. */
export function resetModelHealth(): void {
  coolingUntil.clear();
}

export function markModelFailure(model: string): void {
  coolingUntil.set(model, clock() + MODEL_COOL_DOWN_MS);
}

export function markModelSuccess(model: string): void {
  coolingUntil.delete(model);
}

export function isModelCooling(model: string): boolean {
  const until = coolingUntil.get(model);
  if (until === undefined) return false;
  if (clock() < until) return true;
  coolingUntil.delete(model);
  return false;
}

/** Healthy models first, cooling models last; each group keeps its order. */
export function orderByHealth<T extends string>(chain: readonly T[]): T[] {
  const healthy = chain.filter(model => !isModelCooling(model));
  return [...healthy, ...chain.filter(model => !healthy.includes(model))];
}
