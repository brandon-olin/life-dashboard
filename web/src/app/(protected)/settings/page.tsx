"use client";

import { useRef, useState } from "react";
import {
  Eye,
  EyeOff,
  GripVertical,
  Palette,
  User,
  Home,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useThemeCustomizer } from "@/lib/theme/context";
import {
  BASE_THEMES,
  ACCENT_COLORS,
  RADIUS_OPTIONS,
  FONT_OPTIONS,
  CUSTOM_VAR_OPTIONS,
  type ThemeConfig,
} from "@/lib/theme/presets";
import { useSidebarConfig } from "@/lib/sidebar/context";
import { ALL_NAV_ITEMS } from "@/components/shell/shell";

// ── Left nav ──────────────────────────────────────────────────────────────────

type Section = "appearance" | "account" | "household";

const SECTIONS: { id: Section; label: string; icon: React.ElementType }[] = [
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "account",    label: "Account",    icon: User    },
  { id: "household",  label: "Household",  icon: Home    },
];

function SettingsNav({
  active,
  onChange,
}: {
  active: Section;
  onChange: (s: Section) => void;
}) {
  return (
    <nav className="space-y-0.5">
      {SECTIONS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={cn(
            "flex items-center gap-2.5 w-full px-3 py-2 rounded-md text-sm font-medium transition-colors text-left",
            active === id
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          <Icon className="h-4 w-4 shrink-0" />
          {label}
        </button>
      ))}
    </nav>
  );
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">
      {children}
    </h2>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border rounded-lg bg-card">
      <div className="px-5 py-3 border-b">
        <p className="text-sm font-semibold">{title}</p>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
      {children}
    </p>
  );
}

// ── Sidebar customizer ────────────────────────────────────────────────────────

function SidebarCustomizer() {
  const { sidebarConfig, setSidebarConfig } = useSidebarConfig();
  const dragHrefRef = useRef<string | null>(null);
  const [dragOverHref, setDragOverHref] = useState<string | null>(null);

  const allHrefs = ALL_NAV_ITEMS.map((n) => n.href);
  const orderedHrefs =
    sidebarConfig.order.length > 0
      ? [
          ...sidebarConfig.order.filter((h) => allHrefs.includes(h as (typeof allHrefs)[number])),
          ...allHrefs.filter((h) => !sidebarConfig.order.includes(h)),
        ]
      : [...allHrefs];

  const orderedItems = orderedHrefs
    .map((href) => ALL_NAV_ITEMS.find((n) => n.href === href))
    .filter((n): n is (typeof ALL_NAV_ITEMS)[number] => !!n);

  function toggleHidden(href: string) {
    const hidden = sidebarConfig.hidden.includes(href)
      ? sidebarConfig.hidden.filter((h) => h !== href)
      : [...sidebarConfig.hidden, href];
    setSidebarConfig({ ...sidebarConfig, hidden });
  }

  function handleDragStart(href: string) { dragHrefRef.current = href; }

  function handleDragOver(e: React.DragEvent, targetHref: string) {
    e.preventDefault();
    if (dragHrefRef.current !== targetHref) setDragOverHref(targetHref);
  }

  function handleDrop(targetHref: string) {
    const fromHref = dragHrefRef.current;
    if (!fromHref || fromHref === targetHref) { setDragOverHref(null); return; }
    const next = [...orderedHrefs];
    const fromIdx = next.indexOf(fromHref);
    const toIdx   = next.indexOf(targetHref);
    if (fromIdx === -1 || toIdx === -1) { setDragOverHref(null); return; }
    next.splice(fromIdx, 1);
    next.splice(toIdx, 0, fromHref);
    setSidebarConfig({ ...sidebarConfig, order: next });
    dragHrefRef.current = null;
    setDragOverHref(null);
  }

  function handleDragEnd() { dragHrefRef.current = null; setDragOverHref(null); }

  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground mb-3">
        Drag to reorder. Toggle the eye icon to show or hide sections.
      </p>
      {orderedItems.map((item) => {
        const isHidden   = sidebarConfig.hidden.includes(item.href);
        const isDragOver = dragOverHref === item.href;
        const Icon = item.icon;
        return (
          <div
            key={item.href}
            draggable
            onDragStart={() => handleDragStart(item.href)}
            onDragOver={(e) => handleDragOver(e, item.href)}
            onDrop={() => handleDrop(item.href)}
            onDragEnd={handleDragEnd}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-md border bg-background transition-all select-none",
              isHidden && "opacity-40",
              isDragOver && "border-primary bg-primary/5 scale-[1.01]"
            )}
          >
            <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/50 cursor-grab active:cursor-grabbing" />
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 text-sm font-medium">{item.label}</span>
            <button
              type="button"
              onClick={() => toggleHidden(item.href)}
              className="text-muted-foreground hover:text-foreground ml-1 cursor-pointer"
              aria-label={isHidden ? "Show in sidebar" : "Hide from sidebar"}
            >
              {isHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ── Theme picker ──────────────────────────────────────────────────────────────

function ThemePicker() {
  const { config, setConfig } = useThemeCustomizer();

  function update(partial: Partial<ThemeConfig>) {
    setConfig({ ...config, ...partial });
  }

  const lightThemes = BASE_THEMES.filter((t) => t.category === "light");
  const darkThemes  = BASE_THEMES.filter((t) => t.category === "dark");
  const activeBase  = BASE_THEMES.find((t) => t.id === config.baseThemeId);

  return (
    <div className="space-y-7">
      {/* Light */}
      <div>
        <Label>Light themes</Label>
        <div className="grid grid-cols-3 gap-2">
          {lightThemes.map((theme) => {
            const active = config.baseThemeId === theme.id;
            return (
              <button key={theme.id} type="button" onClick={() => update({ baseThemeId: theme.id })}
                className={cn(
                  "flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all cursor-pointer",
                  active ? "border-primary" : "border-transparent hover:border-muted-foreground/30"
                )}
              >
                <span className="w-full h-10 rounded-md border border-border/60 relative overflow-hidden"
                  style={{ background: theme.vars["--background"] }}>
                  <span className="absolute inset-x-2 top-2 h-1.5 rounded-full"
                    style={{ background: theme.vars["--foreground"], opacity: 0.5 }} />
                  <span className="absolute inset-x-2 bottom-2 h-1.5 rounded-full"
                    style={{ background: theme.vars["--muted"] }} />
                </span>
                <span className="text-xs text-muted-foreground">{theme.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Dark */}
      <div>
        <Label>Dark themes</Label>
        <div className="grid grid-cols-3 gap-2">
          {darkThemes.map((theme) => {
            const active = config.baseThemeId === theme.id;
            return (
              <button key={theme.id} type="button" onClick={() => update({ baseThemeId: theme.id })}
                className={cn(
                  "flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all cursor-pointer",
                  active ? "border-primary" : "border-transparent hover:border-muted-foreground/30"
                )}
              >
                <span className="w-full h-10 rounded-md border border-white/10 relative overflow-hidden"
                  style={{ background: theme.vars["--background"] }}>
                  <span className="absolute inset-x-2 top-2 h-1.5 rounded-full opacity-70"
                    style={{ background: theme.vars["--foreground"] }} />
                  <span className="absolute inset-x-2 bottom-2 h-1.5 rounded-full opacity-40"
                    style={{ background: theme.vars["--muted-foreground"] }} />
                </span>
                <span className="text-xs text-muted-foreground">{theme.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Accent */}
      <div>
        <Label>Accent color</Label>
        <div className="grid grid-cols-6 gap-2">
          {ACCENT_COLORS.map((accent) => {
            const active = config.accentId === accent.id;
            const isDark = activeBase?.category === "dark";
            const accentVars = isDark ? accent.dark : accent.light;
            return (
              <button key={accent.id} type="button" onClick={() => update({ accentId: accent.id })}
                className={cn(
                  "flex flex-col items-center gap-1.5 p-2 rounded-lg border-2 transition-all cursor-pointer",
                  active ? "border-primary" : "border-transparent hover:border-muted-foreground/30"
                )}
              >
                <span className="w-8 h-8 rounded-full border border-border/40"
                  style={{ background: accentVars["--primary"] }} />
                <span className="text-[10px] text-muted-foreground leading-none">{accent.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Radius */}
      <div>
        <Label>Border radius</Label>
        <div className="flex gap-2">
          {RADIUS_OPTIONS.map((opt) => {
            const active = config.radius === opt.value;
            return (
              <button key={opt.value} type="button" onClick={() => update({ radius: opt.value })}
                className={cn(
                  "flex-1 flex flex-col items-center gap-2 py-3 px-2 border-2 transition-all cursor-pointer",
                  active ? "border-primary" : "border-border hover:border-muted-foreground/40"
                )}
                style={{ borderRadius: opt.value === "0rem" ? "0" : `calc(${opt.value} + 4px)` }}
              >
                <span className="w-8 h-8 border-2"
                  style={{
                    borderRadius: opt.value === "0rem" ? "0" : opt.value === "1rem" ? "9999px" : opt.value,
                    borderColor: active ? "var(--primary)" : "var(--muted-foreground)",
                    opacity: active ? 1 : 0.5,
                  }}
                />
                <span className="text-xs text-muted-foreground">{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Font */}
      <div>
        <Label>Font</Label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {FONT_OPTIONS.map((opt) => {
            const active = config.fontFamily === opt.value;
            return (
              <button key={opt.value} type="button" onClick={() => update({ fontFamily: opt.value })}
                className={cn(
                  "flex flex-col items-center gap-1.5 py-3 px-3 border-2 rounded-lg transition-all cursor-pointer",
                  active ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/40"
                )}
              >
                <span className="text-xl font-medium leading-none" style={{ fontFamily: opt.value }}>Aa</span>
                <span className="text-xs text-muted-foreground">{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Preview */}
      <div>
        <Label>Preview</Label>
        <div className="border rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold shrink-0">L</div>
            <div>
              <p className="text-sm font-semibold">Life Dashboard</p>
              <p className="text-xs text-muted-foreground">Your household OS</p>
            </div>
          </div>
          <div className="flex gap-2">
            <span className="px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground">Primary</span>
            <span className="px-3 py-1.5 text-xs font-medium rounded-md border bg-card">Secondary</span>
            <span className="px-3 py-1.5 text-xs font-medium rounded-md bg-muted text-muted-foreground">Muted</span>
          </div>
          <p className="text-xs text-muted-foreground">The quick brown fox jumps over the lazy dog. 1234567890</p>
        </div>
      </div>

      {/* Reset */}
      <div>
        <button type="button"
          onClick={() => setConfig({
            baseThemeId: "clean",
            accentId: "neutral",
            radius: "0.625rem",
            fontFamily: "var(--font-geist-sans), sans-serif",
            customVars: {},
          })}
          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 cursor-pointer"
        >
          Reset to defaults
        </button>
      </div>
    </div>
  );
}

// ── Per-variable color pickers ────────────────────────────────────────────────
// Reads the currently-computed value of a CSS variable by painting it onto a
// 1×1 canvas and reading back the RGB bytes. This works reliably for oklch()
// values since the browser does the conversion.

function resolveVarToHex(varName: string): string {
  if (typeof window === "undefined") return "#888888";
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim();
  if (!raw) return "#888888";
  try {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "#888888";
    ctx.fillStyle = raw;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
  } catch {
    return "#888888";
  }
}

function CustomVarPickers() {
  const { config, setConfig } = useThemeCustomizer();
  const customVars = config.customVars ?? {};

  function handleChange(key: string, hex: string) {
    // Store as hex — the browser accepts it as an inline style value just fine.
    setConfig({ ...config, customVars: { ...customVars, [key]: hex } });
  }

  function handleReset(key: string) {
    const next = { ...customVars };
    delete next[key];
    setConfig({ ...config, customVars: next });
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Override individual color variables on top of the selected preset. Overridden variables are shown with a ring. Click <em>reset</em> to restore the preset value.
      </p>
      <div className="grid grid-cols-1 gap-2">
        {CUSTOM_VAR_OPTIONS.map(({ key, label }) => {
          const overridden = !!customVars[key];
          const currentHex = overridden ? customVars[key] : resolveVarToHex(key);
          return (
            <div key={key} className="flex items-center gap-3">
              {/* Native color picker — swatch acts as the visible trigger */}
              <label className="relative cursor-pointer shrink-0 group">
                <input
                  type="color"
                  value={currentHex}
                  onChange={(e) => handleChange(key, e.target.value)}
                  className="sr-only"
                />
                <span
                  className={cn(
                    "block w-7 h-7 rounded border-2 transition-all group-hover:scale-110",
                    overridden
                      ? "border-primary ring-2 ring-primary/30"
                      : "border-border"
                  )}
                  style={{ background: currentHex }}
                />
              </label>

              <span className={cn("flex-1 text-sm", overridden ? "font-medium text-foreground" : "text-muted-foreground")}>
                {label}
              </span>

              <span className="text-xs font-mono text-muted-foreground/50 hidden sm:block">{key}</span>

              {overridden && (
                <button
                  type="button"
                  onClick={() => handleReset(key)}
                  className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 shrink-0"
                >
                  reset
                </button>
              )}
            </div>
          );
        })}
      </div>

      {Object.keys(customVars).length > 0 && (
        <button
          type="button"
          onClick={() => setConfig({ ...config, customVars: {} })}
          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 mt-1 block"
        >
          Clear all overrides
        </button>
      )}
    </div>
  );
}

// ── Sections ──────────────────────────────────────────────────────────────────

function AppearanceSection() {
  return (
    <div className="space-y-5">
      <SectionTitle>Appearance</SectionTitle>
      <SubSection title="Theme presets">
        <ThemePicker />
      </SubSection>
      <SubSection title="Custom color overrides">
        <CustomVarPickers />
      </SubSection>
      <SubSection title="Sidebar layout">
        <SidebarCustomizer />
      </SubSection>
    </div>
  );
}

function AccountSection() {
  return (
    <div className="space-y-5">
      <SectionTitle>Account</SectionTitle>
      <SubSection title="Profile">
        <div className="flex items-center gap-5 mb-5">
          {/* Avatar placeholder — upload will be wired up once the API supports it */}
          <div className="h-16 w-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xl font-semibold shrink-0">
            ?
          </div>
          <div>
            <p className="text-sm font-medium mb-1">Profile photo</p>
            <p className="text-xs text-muted-foreground">
              Avatar upload coming soon. Your initials are shown in the sidebar for now.
            </p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Display name, email, and password changes — coming soon.
        </p>
      </SubSection>
    </div>
  );
}

function HouseholdSection() {
  return (
    <div className="space-y-5">
      <SectionTitle>Household</SectionTitle>
      <SubSection title="Members">
        <p className="text-sm text-muted-foreground">
          Household member management — invite, roles, and per-member views — coming soon.
        </p>
      </SubSection>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [active, setActive] = useState<Section>("appearance");

  return (
    <div className="flex h-full">
      {/* Settings left-nav */}
      <div className="w-52 shrink-0 border-r bg-card p-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-3 mb-3">
          Settings
        </p>
        <SettingsNav active={active} onChange={setActive} />
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto p-8 max-w-2xl">
        {active === "appearance" && <AppearanceSection />}
        {active === "account"    && <AccountSection />}
        {active === "household"  && <HouseholdSection />}
      </div>
    </div>
  );
}
