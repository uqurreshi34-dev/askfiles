import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'askfiles-tools-config';

export const ALL_TOOL_IDS = [
  'network', 'large-files', 'storage', 'scanner',
  'cleaner', 'converter', 'csv', 'pdf', 'txt'
] as const;

/** Tools that were replaced: a saved layout keeps the new tool in the old one's place (and hidden state). */
const RENAMED_TOOLS: Record<string, ToolId> = { sensitive: 'cleaner' };

export type ToolId = typeof ALL_TOOL_IDS[number];

interface ToolsConfig {
  order: ToolId[];
  hidden: ToolId[];
}

const DEFAULT_CONFIG: ToolsConfig = {
  order: [...ALL_TOOL_IDS],
  hidden: [],
};

export function useToolsConfig() {
  const [config, setConfig] = useState<ToolsConfig>(DEFAULT_CONFIG);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as ToolsConfig;
          const known = new Set<string>(ALL_TOOL_IDS);
          const migrate = (ids: string[]) =>
            [...new Set(ids.map(id => RENAMED_TOOLS[id] ?? id))].filter(id => known.has(id)) as ToolId[];
          parsed.order = migrate(parsed.order ?? []);
          parsed.hidden = migrate(parsed.hidden ?? []);
          const knownIds = new Set(parsed.order);
          const missing = ALL_TOOL_IDS.filter(id => !knownIds.has(id));
          if (missing.length > 0) parsed.order = [...parsed.order, ...missing];
          setConfig(parsed);
        } catch {
          setConfig(DEFAULT_CONFIG);
        }
      }
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  const saveConfig = useCallback(async (next: ToolsConfig) => {
    setConfig(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const reorderTools = useCallback((newOrder: ToolId[]) => {
    // newOrder contains only visible tool IDs — merge hidden tools back in at end
    const hiddenIds = config.order.filter(id => config.hidden.includes(id));
    const fullOrder = [...newOrder, ...hiddenIds.filter(id => !newOrder.includes(id))];
    saveConfig({ ...config, order: fullOrder });
  }, [config, saveConfig]);

  const hideTool = useCallback((id: ToolId) => {
    saveConfig({ ...config, hidden: [...config.hidden, id] });
  }, [config, saveConfig]);

  const restoreTool = useCallback((id: ToolId) => {
    saveConfig({ ...config, hidden: config.hidden.filter(h => h !== id) });
  }, [config, saveConfig]);

  const visibleTools = config.order.filter(id => !config.hidden.includes(id));
  const hiddenTools = config.order.filter(id => config.hidden.includes(id));

  return {
    loaded,
    config,
    visibleTools,
    hiddenTools,
    reorderTools,
    hideTool,
    restoreTool,
  };
}
