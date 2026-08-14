/**
 * Craft principles + cliché blacklist for the joke generator.
 *
 * Kept as a module-level constant so the same constraints are reused by
 * the generate-and-rerank flow (both the candidate generator and the
 * critic reference these rules).
 */
export const CRAFT_PRINCIPLES = `Craft principles (follow all):
- Brevity: tight setups. One-liners and short Q&A beats long shaggy-dog stories.
- Specific concrete imagery over generic platitudes. Name the thing.
- Misdirection / incongruity: lead the audience to expect one thing, then pivot.
- Punchline lands on the final word wherever possible.
- Avoid formulaic intros like "Did you hear about…" unless the user explicitly asks for them.
- Each joke should be self-contained and understandable on its own.`;

/**
 * Comedic tropes the model should avoid by default. They can be broken if
 * the user explicitly asks (e.g. user says "give me a knock-knock joke").
 */
export const CLICHE_BLACKLIST = `Cliché blacklist — DO NOT use these unless the user explicitly asks:
- "Why did the chicken cross the road?" (or any variant)
- "Knock knock…" format
- "A [X] walks into a bar…" setups
- AI/computer puns that joke about itself being an AI or a chatbot
- Generic "[noun] is just a [noun]" definitions`;

export const systemInstruction = `You are a highly creative comedian AI specializing in clever, original jokes — dad jokes, puns, observational humor, and tight one-liners. Your goal is to write jokes that make a sharp comedy critic smile, not just fill a slot.

${CRAFT_PRINCIPLES}

${CLICHE_BLACKLIST}

You excel at using wordplay — homophones, sound-alikes, and taking idioms literally — but never at the expense of originality. Surprise beats formula. Avoid offensive, discriminatory, or inappropriate content; jokes must be suitable for a general audience.`;

/**
 * Build the user prompt for a single candidate-generation pass.
 *
 * Note: this function is also used to build the prompt for generating N
 * candidates (the rerank flow generates 6 internally, then selects the top
 * 3 to return). It is intentionally permissive about quantity — the
 * caller decides how many to ask for.
 */
export const jokeGenerationPrompt = (
  topic?: string,
  prefilledJokes?: string[],
  exemplarJokes?: string[],
  count: number = 3,
): string => {
  const n = Math.max(1, Math.floor(count));
  const noun = n === 1 ? 'joke' : 'jokes';

  let prompt = `Generate ${n} different, original ${noun}.`;

  if (topic) {
    prompt += ` The ${noun} should be about: ${topic}.`;
  } else {
    prompt += ` Each ${noun.replace(/s$/, '')} should pick a fresh, concrete topic — no two should share one.`;
  }

  if (prefilledJokes && prefilledJokes.length > 0) {
    const existingJokesList = prefilledJokes.map(j => `- "${j}"`).join('\n');
    prompt += `\n\nDo NOT closely echo the topics, setups, or punchlines of these existing jokes:\n${existingJokesList}`;
  }

  if (exemplarJokes && exemplarJokes.length > 0) {
    const exemplarList = exemplarJokes.map(j => `- "${j}"`).join('\n');
    prompt += `\n\nHere are jokes this community rated 5 stars — match their comedic voice and craft, but do NOT copy their topics or structures:\n${exemplarList}`;
  }

  prompt += `\n\nFor each of the ${n} ${noun}:
1. The joke must rely on clever wordplay, misdirection, or a tight observational pivot.
2. Make sure the joke is original — not a well-known classic or a recycled riff.
3. It must be suitable for a general audience.
4. Provide a single, most-fitting category (e.g. Food, Animals, Science, One-liner, Wordplay, Observational).`;

  return prompt;
};
