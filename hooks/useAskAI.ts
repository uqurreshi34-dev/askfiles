import { useState, useRef } from 'react';

const BACKEND_URL = 'https://askfiles-backend.onrender.com';

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
      const response = await fetch(`${BACKEND_URL}/api/ask-ai/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ question, context }),
      });

      const data = await response.json();

      if (data.error) {
        setAnswer(`Error: ${data.error}`);
        return;
      }

      setAnswer(data.answer ?? 'No answer received.');
    } catch (e) {
      setAnswer('Could not reach AI. Check your connection and try again.');
    } finally {
      setThinking(false);
      askingRef.current = false;
    }
  }

  return { answer, thinking, ask, reset };
}
