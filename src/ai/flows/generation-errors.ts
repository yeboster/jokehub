/**
 * Public generation error messages and their codes. Only these messages are
 * shown to clients; any other error becomes GENERATION_FAILED, because
 * provider errors may contain prompts, joke text or credentials.
 */
export const QUALITY_ERROR = 'Joke quality check failed. Please try again.';
export const SCARCITY_ERROR = 'Could not produce three eligible, unique jokes. Please try again.';
export const NONE_ELIGIBLE_ERROR = 'No joke passed the quality check. Please try again.';
export const EMPTY_CANDIDATES_ERROR = 'AI failed to generate joke candidates. The output was empty.';
export const INVALID_CANDIDATES_ERROR = 'AI returned candidate data in an unexpected format.';
export const MODELS_UNAVAILABLE_ERROR = 'All models are busy right now. Please try again in a minute.';
export const DISCONNECTED_ERROR = 'Generation request disconnected.';
export const CALL_LIMIT_ERROR = 'Generation call limit reached.';

export const PUBLIC_GENERATION_ERRORS: Readonly<Record<string, string>> = {
  [QUALITY_ERROR]: 'QUALITY_CHECK_FAILED',
  [SCARCITY_ERROR]: 'INSUFFICIENT_JOKES',
  [NONE_ELIGIBLE_ERROR]: 'INSUFFICIENT_JOKES',
  [EMPTY_CANDIDATES_ERROR]: 'EMPTY_CANDIDATES',
  [INVALID_CANDIDATES_ERROR]: 'INVALID_CANDIDATES',
  [MODELS_UNAVAILABLE_ERROR]: 'MODELS_UNAVAILABLE',
};
