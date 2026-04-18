import { useState, useRef } from 'react';

const GROQ_API_KEY = process.env.EXPO_PUBLIC_GROQ_API_KEY ?? '';
const GROQ_MODEL = 'llama-3.1-8b-instant';

export function useAskAI() {
  const [answer, setAnswer] = useState('');
  const [thinking, setThinking] = useState(false);
  const askingRef = useRef(false);

  function reset() {
    setAnswer('');
    setThinking(false);
    askingRef.current = false;
  }

  async function ask(question: string, context: string) {
    if (askingRef.current) return;
    askingRef.current = true;
    setThinking(true);
    setAnswer('');
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [
            {
              role: 'system',
              content: `You are AskFiles AI, a helpful file manager assistant built into the AskFiles app.
The user's device file context is below. Read it carefully before answering.

${context}

Rules:
- Never confuse image filenames with video filenames — they are listed separately.
- Screenshots are files whose names start with "Screenshot_". Use the screenshotCount field for the exact number, do not count manually.
- PNG files are images. MP4 files are videos. Never call a video an image.
- Keep answers short and practical — 3-4 sentences max unless a list is genuinely needed.
- Do not make up files that aren't in the context.`,
            },
            {
              role: 'user',
              content: question,
            },
          ],
          max_tokens: 1024,
          temperature: 0.7,
        }),
      });

      const data = await response.json();

      if (data.error) {
        setAnswer(`Error: ${data.error.message}`);
        return;
      }

      setAnswer(data.choices?.[0]?.message?.content ?? 'No answer received.');
    } catch (e) {
      console.log('GROQ ERROR:', e);
      setAnswer('Could not reach AI. Check your connection and try again.');
    } finally {
      setThinking(false);
      askingRef.current = false;
    }
  }

  return { answer, thinking, ask, reset };
}
