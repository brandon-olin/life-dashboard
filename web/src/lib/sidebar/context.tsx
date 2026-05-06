"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export const SIDEBAR_STORAGE_KEY = "ld-sidebar-config";

export type SidebarConfig = {
  hidden: string[]; // hrefs that are hidden
  order: string[];  // hrefs in display order (empty = use default)
};

const DEFAULT_SIDEBAR_CONFIG: SidebarConfig = { hidden: [], order: [] };

export function loadSidebarConfig(): SidebarConfig {
  if (typeof window === "undefined") return DEFAULT_SIDEBAR_CONFIG;
  try {
    const raw = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (!raw) return DEFAULT_SIDEBAR_CONFIG;
    return { ...DEFAULT_SIDEBAR_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SIDEBAR_CONFIG;
  }
}

export function saveSidebarConfig(config: SidebarConfig): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SIDEBAR_STORAGE_KEY, JSON.stringify(config));
}

type SidebarConfigContextValue = {
  sidebarConfig: SidebarConfig;
  setSidebarConfig: (config: SidebarConfig) => void;
};

const SidebarConfigContext = createContext<SidebarConfigContextValue>({
  sidebarConfig: DEFAULT_SIDEBAR_CONFIG,
  setSidebarConfig: () => {},
});

export function SidebarConfigProvider({ children }: { children: React.ReactNode }) {
  const [sidebarConfig, setSidebarConfigState] = useState<SidebarConfig>(DEFAULT_SIDEBAR_CONFIG);

  useEffect(() => {
    setSidebarConfigState(loadSidebarConfig());

    // Sync when another tab changes sidebar config
    function onStorage(e: StorageEvent) {
      if (e.key === SIDEBAR_STORAGE_KEY) setSidebarConfigState(loadSidebarConfig());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setSidebarConfig = useCallback((config: SidebarConfig) => {
    setSidebarConfigState(config);
    saveSidebarConfig(config);
  }, []);

  return (
    <SidebarConfigContext.Provider value={{ sidebarConfig, setSidebarConfig }}>
      {children}
    </SidebarConfigContext.Provider>
  );
}

export function useSidebarConfig() {
  return useContext(SidebarConfigContext);
}
