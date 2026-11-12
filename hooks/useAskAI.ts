import { useState, useRef } from 'react';
import { getLanguage } from '@/modules/appLanguage';
import { searchText } from '@/modules/i18n/searchText';

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
    // The reply comes back in the app's language (the backend checks the value).
    const language = getLanguage();
    const t = searchText(language);
    try {
      const response = await fetch(`${BACKEND_URL}/api/ask-ai/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY,
        },
        body: JSON.stringify({ question, context, language }),
      });

      const data = await response.json();

      if (data.error) {
        // The server's wording is English: shown as before in English,
        // and in the app's language otherwise.
        setAnswer(language === 'en' ? `Error: ${data.error}` : response.status === 429 ? t.aiBusy : t.aiUnavailable);
        return;
      }

      setAnswer(data.answer ?? t.aiNoAnswer);
    } catch (e) {
      setAnswer(t.aiOffline);
    } finally {
      setThinking(false);
      askingRef.current = false;
    }
  }

  return { answer, thinking, cooldown, ask, reset };
}
