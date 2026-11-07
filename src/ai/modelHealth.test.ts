// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  MODEL_COOL_DOWN_MS, isModelCooling, markModelFailure, markModelSuccess, orderByHealth,
  resetModelHealth, setModelHealthClock,
} from './modelHealth';
import { modelChain } from './models';

let now = 1_000_000;
beforeEach(() => { now = 1_000_000; resetModelHealth(); setModelHealthClock(() => now); });
afterEach(() => { resetModelHealth(); setModelHealthClock(undefined); });

const chain = modelChain('googleai/gemini-3.6-flash');

describe('cross-request model cool-down', () => {
  it('keeps the chain order when nothing is cooling', () => {
    expect(orderByHealth(chain)).toEqual(chain);
  });
  it('moves a failed model to the end, keeping the others in order', () => {
    markModelFailure(chain[0]);
    expect(isModelCooling(chain[0])).toBe(true);
    expect(orderByHealth(chain)).toEqual([chain[1], chain[2], chain[0]]);
  });
  it('keeps several cooling models at the end in their original order', () => {
    markModelFailure(chain[1]); markModelFailure(chain[0]);
    expect(orderByHealth(chain)).toEqual([chain[2], chain[0], chain[1]]);
  });
  it('expires after five minutes', () => {
    markModelFailure(chain[0]);
    now += MODEL_COOL_DOWN_MS - 1;
    expect(isModelCooling(chain[0])).toBe(true);
    now += 1;
    expect(isModelCooling(chain[0])).toBe(false);
    expect(orderByHealth(chain)).toEqual(chain);
    expect(MODEL_COOL_DOWN_MS).toBe(5 * 60_000);
  });
  it('a later failure restarts the window and a success clears it', () => {
    markModelFailure(chain[0]);
    now += MODEL_COOL_DOWN_MS - 10;
    markModelFailure(chain[0]);
    now += 20;
    expect(isModelCooling(chain[0])).toBe(true);
    markModelSuccess(chain[0]);
    expect(isModelCooling(chain[0])).toBe(false);
  });
  it('does not mutate the input chain', () => {
    const input = [...chain];
    markModelFailure(chain[0]);
    orderByHealth(input);
    expect(input).toEqual(chain);
  });
});
