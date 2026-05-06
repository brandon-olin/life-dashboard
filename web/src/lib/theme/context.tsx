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
  setConfig: (config: ThemeConfig) => void;
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

  // On mount: load saved config and apply it
  useEffect(() => {
    const saved = loadThemeConfig();
    setConfigState(saved);
    const isDark = document.documentElement.classList.contains("dark");
    applyThemeConfig(saved, isDark);
  }, []);

  // Re-apply whenever dark/light class toggles (next-themes changes the class)
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const isDark = document.documentElement.classList.contains("dark");
      applyThemeConfig(config, isDark);
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, [config]);

  const setConfig = useCallback((next: ThemeConfig) => {
    setConfigState(next);
    saveThemeConfig(next);
    const isDark = document.documentElement.classList.contains("dark");
    applyThemeConfig(next, isDark);
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
