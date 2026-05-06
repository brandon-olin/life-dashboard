// ── Theme presets ─────────────────────────────────────────────────────────────
// Each preset sets the primary accent color (light + dark mode) and border radius.
// Background/foreground are left to the dark/light toggle in the sidebar.
//
// Variables set here map to CSS custom properties on :root / .dark.
// oklch(L C H) — Lightness, Chroma, Hue

export type ThemePreset = {
  id: string;
  label: string;
  // Color shown in the preset swatch
  swatch: string;
  // CSS vars applied to :root (light mode)
  light: Record<string, string>;
  // CSS vars applied to .dark
  dark: Record<string, string>;
  // Border radius (rem)
  radius: string;
};

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "default",
    label: "Default",
    swatch: "oklch(0.205 0 0)",
    light: {
      "--primary": "oklch(0.205 0 0)",
      "--primary-foreground": "oklch(0.985 0 0)",
      "--ring": "oklch(0.708 0 0)",
      "--sidebar-primary": "oklch(0.205 0 0)",
      "--sidebar-primary-foreground": "oklch(0.985 0 0)",
    },
    dark: {
      "--primary": "oklch(0.922 0 0)",
      "--primary-foreground": "oklch(0.205 0 0)",
      "--ring": "oklch(0.556 0 0)",
      "--sidebar-primary": "oklch(0.488 0.243 264.376)",
      "--sidebar-primary-foreground": "oklch(0.985 0 0)",
    },
    radius: "0.625rem",
  },
  {
    id: "ocean",
    label: "Ocean",
    swatch: "oklch(0.546 0.175 250)",
    light: {
      "--primary": "oklch(0.546 0.175 250)",
      "--primary-foreground": "oklch(0.985 0 0)",
      "--ring": "oklch(0.67 0.14 250)",
      "--sidebar-primary": "oklch(0.546 0.175 250)",
      "--sidebar-primary-foreground": "oklch(0.985 0 0)",
    },
    dark: {
      "--primary": "oklch(0.72 0.15 250)",
      "--primary-foreground": "oklch(0.145 0 0)",
      "--ring": "oklch(0.546 0.175 250)",
      "--sidebar-primary": "oklch(0.65 0.18 250)",
      "--sidebar-primary-foreground": "oklch(0.985 0 0)",
    },
    radius: "0.625rem",
  },
  {
    id: "forest",
    label: "Forest",
    swatch: "oklch(0.5 0.14 145)",
    light: {
      "--primary": "oklch(0.5 0.14 145)",
      "--primary-foreground": "oklch(0.985 0 0)",
      "--ring": "oklch(0.65 0.12 145)",
      "--sidebar-primary": "oklch(0.5 0.14 145)",
      "--sidebar-primary-foreground": "oklch(0.985 0 0)",
    },
    dark: {
      "--primary": "oklch(0.7 0.14 145)",
      "--primary-foreground": "oklch(0.145 0 0)",
      "--ring": "oklch(0.5 0.14 145)",
      "--sidebar-primary": "oklch(0.62 0.16 145)",
      "--sidebar-primary-foreground": "oklch(0.985 0 0)",
    },
    radius: "0.625rem",
  },
  {
    id: "sunset",
    label: "Sunset",
    swatch: "oklch(0.65 0.18 50)",
    light: {
      "--primary": "oklch(0.65 0.18 50)",
      "--primary-foreground": "oklch(0.985 0 0)",
      "--ring": "oklch(0.75 0.14 50)",
      "--sidebar-primary": "oklch(0.65 0.18 50)",
      "--sidebar-primary-foreground": "oklch(0.985 0 0)",
    },
    dark: {
      "--primary": "oklch(0.78 0.17 50)",
      "--primary-foreground": "oklch(0.145 0 0)",
      "--ring": "oklch(0.65 0.18 50)",
      "--sidebar-primary": "oklch(0.72 0.19 50)",
      "--sidebar-primary-foreground": "oklch(0.145 0 0)",
    },
    radius: "0.625rem",
  },
  {
    id: "rose",
    label: "Rose",
    swatch: "oklch(0.59 0.22 10)",
    light: {
      "--primary": "oklch(0.59 0.22 10)",
      "--primary-foreground": "oklch(0.985 0 0)",
      "--ring": "oklch(0.72 0.17 10)",
      "--sidebar-primary": "oklch(0.59 0.22 10)",
      "--sidebar-primary-foreground": "oklch(0.985 0 0)",
    },
    dark: {
      "--primary": "oklch(0.75 0.19 10)",
      "--primary-foreground": "oklch(0.145 0 0)",
      "--ring": "oklch(0.59 0.22 10)",
      "--sidebar-primary": "oklch(0.68 0.21 10)",
      "--sidebar-primary-foreground": "oklch(0.985 0 0)",
    },
    radius: "0.625rem",
  },
  {
    id: "violet",
    label: "Violet",
    swatch: "oklch(0.55 0.23 295)",
    light: {
      "--primary": "oklch(0.55 0.23 295)",
      "--primary-foreground": "oklch(0.985 0 0)",
      "--ring": "oklch(0.68 0.18 295)",
      "--sidebar-primary": "oklch(0.55 0.23 295)",
      "--sidebar-primary-foreground": "oklch(0.985 0 0)",
    },
    dark: {
      "--primary": "oklch(0.73 0.19 295)",
      "--primary-foreground": "oklch(0.145 0 0)",
      "--ring": "oklch(0.55 0.23 295)",
      "--sidebar-primary": "oklch(0.65 0.22 295)",
      "--sidebar-primary-foreground": "oklch(0.985 0 0)",
    },
    radius: "0.625rem",
  },
];

export const RADIUS_OPTIONS = [
  { label: "Sharp", value: "0rem" },
  { label: "Subtle", value: "0.375rem" },
  { label: "Rounded", value: "0.625rem" },
  { label: "Pill", value: "1rem" },
];

export const FONT_OPTIONS = [
  { label: "System", value: "system-ui, sans-serif" },
  { label: "Geist", value: "var(--font-geist-sans), sans-serif" },
  { label: "Serif", value: "Georgia, 'Times New Roman', serif" },
  { label: "Mono", value: "ui-monospace, 'Cascadia Code', monospace" },
];

export type ThemeConfig = {
  presetId: string;
  radius: string;
  fontFamily: string;
};

export const DEFAULT_CONFIG: ThemeConfig = {
  presetId: "default",
  radius: "0.625rem",
  fontFamily: "var(--font-geist-sans), sans-serif",
};

const STORAGE_KEY = "ld-theme-config";

export function loadThemeConfig(): ThemeConfig {
  if (typeof window === "undefined") return DEFAULT_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveThemeConfig(config: ThemeConfig): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function applyThemeConfig(config: ThemeConfig, isDark: boolean): void {
  const root = document.documentElement;
  const preset = THEME_PRESETS.find((p) => p.id === config.presetId) ?? THEME_PRESETS[0];
  const vars = isDark ? preset.dark : preset.light;

  for (const [key, val] of Object.entries(vars)) {
    root.style.setProperty(key, val);
  }
  root.style.setProperty("--radius", config.radius);
  root.style.setProperty("--font-sans", config.fontFamily);
}
