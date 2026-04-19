import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const FREE_LIMIT = 20;
const STORAGE_KEY = 'ai_query_limit';

interface QueryLimit {
  count: number;
  date: string; // YYYY-MM-DD
}

function todayString(): string {
  return new Date().toISOString().split('T')[0];
}

export function useAiQueryLimit(isPro: boolean) {
  const [queriesUsed, setQueriesUsed] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadCount();
  }, []);

  async function loadCount() {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data: QueryLimit = JSON.parse(raw);
        if (data.date === todayString()) {
          setQueriesUsed(data.count);
        } else {
          // New day — reset
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ count: 0, date: todayString() }));
          setQueriesUsed(0);
        }
      }
    } catch {
      setQueriesUsed(0);
    } finally {
      setLoaded(true);
    }
  }

  async function incrementQuery() {
    if (isPro) return; // Pro users — no limit
    const newCount = queriesUsed + 1;
    setQueriesUsed(newCount);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ count: newCount, date: todayString() }));
    } catch {}
  }

  const queriesRemaining = Math.max(0, FREE_LIMIT - queriesUsed);
  const isLimitReached = !isPro && loaded && queriesUsed >= FREE_LIMIT;

  return { queriesUsed, queriesRemaining, isLimitReached, incrementQuery, loaded };
}
