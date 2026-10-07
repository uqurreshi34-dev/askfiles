/**
 * What anyone can ask, Pro or not.
 *
 * Ask AI is the feature people want to try before they buy, and a reviewer
 * asked for exactly that. These questions are answered on the phone by
 * askLocal -- from numbers useStorage has already measured -- so they are
 * instant, work offline and never reach the backend: offering them free
 * costs nothing and gives away nothing a model would have to be paid for.
 * Asking in your own words, typed or spoken, stays with Pro.
 *
 * Each question here must be one answerLocally can answer, or a free user
 * would tap it and get nothing. isFreeQuestion is how search.tsx keeps a
 * free user's question from ever being sent to the backend.
 */

export const FREE_QUESTIONS: readonly string[] = [
  "What's my largest file?",
  "What's my largest image?",
  "What's my largest video?",
  "What's taking up the most space?",
  'How much storage do I have left?',
];

export function isFreeQuestion(question: string): boolean {
  return FREE_QUESTIONS.includes(question.trim());
}

/** Said to a free user when a free question cannot be answered yet: the storage scan is still running. */
export const STILL_READING = "I'm still reading your storage. Give me a moment and ask again.";
