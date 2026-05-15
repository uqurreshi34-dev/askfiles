import { useState, useRef } from 'react';

const BACKEND_URL = 'https://askfiles-backend.onrender.com';
const API_KEY = process.env.EXPO_PUBLIC_ASKFILES_API_KEY ?? '';

export function useAskAI() {
  const [answer, setAnswer] = useState('');
  const [thinking, setThinking] = useState(false);
  const askingRef = useRef(false);
  const lastAskTime = useRef(0);
  const [cooldown, setCooldown] = useState(0);

  function reset() {
    setAnswer('');
    setThinking(false);
    askingRef.current = false;
  }

  async function ask(question: string, context: string) {
    if (askingRef.current) return;
    const now = Date.now();
    if (now - lastAskTime.current < 10000) return;
    lastAskTime.current = now;
    askingRef.current = true;
    setThinking(true);
    setAnswer('');
    setCooldown(10);
    const interval = setInterval(() => {
      setCooldown(prev => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
    try {
      const response = await fetch(`${BACKEND_URL}/api/ask-ai/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY,
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

  return { answer, thinking, cooldown, ask, reset };
}
