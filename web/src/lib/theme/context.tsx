"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  applyThemeConfig,
  DEFAULT_CONFIG,
  loadThemeConfig,
  saveThemeConfig,
  type ThemeConfig,
} from "./presets";

type ThemeContextValue = {
  config: ThemeConfig;
  setConfig: (config: ThemeConfig, animate?: boolean) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  config: DEFAULT_CONFIG,
  setConfig: () => {},
});

export function ThemeCustomizerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [config, setConfigState] = useState<ThemeConfig>(DEFAULT_CONFIG);

  // On mount: load saved config and apply immediately (no animation — avoids
  // a flash before the CSS vars are in place).
  useEffect(() => {
    const saved = loadThemeConfig();
    setConfigState(saved);
    applyThemeConfig(saved, /* animate = */ false);
  }, []);

  const setConfig = useCallback((next: ThemeConfig, animate = true) => {
    setConfigState(next);
    saveThemeConfig(next);
    applyThemeConfig(next, animate);
  }, []);

  return (
    <ThemeContext.Provider value={{ config, setConfig }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemeCustomizer() {
  return useContext(ThemeContext);
}
