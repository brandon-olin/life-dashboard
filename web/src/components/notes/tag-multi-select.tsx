"use client";

import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, Search, X, Check } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { components } from "@/lib/api/schema";

type TagResponse = components["schemas"]["TagResponse"];

interface TagMultiSelectProps {
  tags: TagResponse[];
  counts: Map<string, number | null>;
  selected: string[];
  onChange: (ids: string[]) => void;
  mode: "any" | "all";
  onModeChange: (mode: "any" | "all") => void;
}

export function TagMultiSelect({
  tags,
  counts,
  selected,
  onChange,
  mode,
  onModeChange,
}: TagMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 0);
  }, [open]);

  // Measure how many chips fit in the trigger
  const measure = useCallback(() => {
    const trigger = triggerRef.current;
    const measureDiv = measureRef.current;
    if (!trigger || !measureDiv || selected.length === 0) {
      setVisibleCount(null);
      return;
    }
    // Available width: trigger width minus padding (px-2 = 8px each side) minus chevron/clear area (~38px)
    const availableWidth = trigger.clientWidth - 16 - 38;
    const chipEls = Array.from(measureDiv.children) as HTMLElement[];
    let used = 0;
    let fits = 0;
    // Reserve space for the "+N" badge (approx 28px) when not all fit
    const badgeWidth = 28;
    for (let i = 0; i < chipEls.length; i++) {
      const chipW = chipEls[i].offsetWidth + 4; // 4px gap
      const isLast = i === chipEls.length - 1;
      const wouldNeedBadge = !isLast;
      const needed = used + chipW + (wouldNeedBadge ? badgeWidth : 0);
      if (needed <= availableWidth) {
        used += chipW;
        fits = i + 1;
      } else {
        break;
      }
    }
    setVisibleCount(fits >= selected.length ? null : Math.max(fits, 1));
  }, [selected]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(trigger);
    return () => ro.disconnect();
  }, [measure]);

  const filtered = tags.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  }

  function clearAll(e: React.MouseEvent) {
    e.stopPropagation();
    onChange([]);
  }

  const hasSelection = selected.length > 0;
  const selectedTags = selected.map((id) => tags.find((t) => t.id === id)).filter(Boolean) as TagResponse[];
  const shownTags = visibleCount !== null ? selectedTags.slice(0, visibleCount) : selectedTags;
  const overflowCount = visibleCount !== null ? selectedTags.length - visibleCount : 0;

  return (
    <div ref={containerRef} className="relative">

      {/* ── Trigger — always single line ─────────────────────────── */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "w-full flex items-center gap-1.5 h-7 px-2 rounded-lg border text-xs transition-colors",
          "bg-transparent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          open ? "border-ring" : "border-input hover:border-foreground/40"
        )}
      >
        {/* Hidden measurement div — renders all chips off-screen to measure widths */}
        <div
          ref={measureRef}
          aria-hidden
          className="absolute left-2 top-0 flex items-center gap-1 pointer-events-none"
          style={{ visibility: "hidden", whiteSpace: "nowrap" }}
        >
          {selectedTags.map((tag) => (
            <span
              key={tag.id}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-muted text-foreground font-medium"
            >
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: tag.color ?? "var(--primary)" }} />
              {tag.name}
            </span>
          ))}
        </div>

        {/* Visible summary */}
        <div className="flex-1 flex items-center gap-1 min-w-0 overflow-hidden">
          {hasSelection ? (
            <>
              {shownTags.map((tag) => (
                <span
                  key={tag.id}
                  className="flex items-center gap-1 shrink-0 px-1.5 py-0.5 rounded-md bg-muted text-foreground font-medium"
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: tag.color ?? "var(--primary)" }} />
                  {tag.name}
                </span>
              ))}
              {overflowCount > 0 && (
                <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground leading-none">
                  +{overflowCount}
                </span>
              )}
            </>
          ) : (
            <span className="text-muted-foreground">Filter by tag…</span>
          )}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-1 shrink-0">
          {hasSelection && (
            <button
              type="button"
              onMouseDown={clearAll}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Clear filter"
            >
              <X className="h-3 w-3" />
            </button>
          )}
          <ChevronDown
            className={cn("h-3 w-3 text-muted-foreground transition-transform duration-150", open && "rotate-180")}
          />
        </div>
      </button>

      {/* ── Dropdown ─────────────────────────────────────────────── */}
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-popover border border-border rounded-lg shadow-md overflow-hidden">

          {/* Search */}
          <div className="flex items-center gap-1.5 px-2 py-1.5 border-b">
            <Search className="h-3 w-3 text-muted-foreground shrink-0" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tags…"
              className="flex-1 text-xs bg-transparent outline-none placeholder:text-muted-foreground/60"
            />
            {search && (
              <button type="button" onClick={() => setSearch("")} className="text-muted-foreground hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Tag list */}
          <div className="max-h-48 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">No tags found.</p>
            ) : (
              filtered.map((tag) => {
                const isSelected = selected.includes(tag.id);
                const count = counts.get(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggle(tag.id)}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors text-left",
                      isSelected ? "bg-muted/60" : "hover:bg-muted/40"
                    )}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: tag.color ?? "var(--muted-foreground)" }}
                    />
                    <span className={cn("flex-1", isSelected && "font-medium")}>{tag.name}</span>
                    {count != null && (
                      <span className="text-muted-foreground tabular-nums">{count}</span>
                    )}
                    <span className={cn("w-3.5 shrink-0", isSelected ? "text-primary" : "text-transparent")}>
                      <Check className="h-3.5 w-3.5" />
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer — Any/All toggle + clear */}
          <div className="border-t px-3 py-1.5 flex items-center justify-between gap-2">
            {/* Any / All toggle — only meaningful with 2+ tags */}
            <TooltipProvider delayDuration={300}>
              <div className={cn(
                "flex rounded-md border text-[11px] overflow-hidden transition-opacity",
                selected.length < 2 && "opacity-40 pointer-events-none"
              )}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => onModeChange("any")}
                      className={mode === "any"
                        ? "px-2 py-0.5 bg-foreground text-background font-medium"
                        : "px-2 py-0.5 text-muted-foreground hover:text-foreground transition-colors"}
                    >
                      Any
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[160px] text-center">
                    Show notes that match <span className="font-semibold">at least one</span> selected tag
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => onModeChange("all")}
                      className={`border-l ${mode === "all"
                        ? "px-2 py-0.5 bg-foreground text-background font-medium"
                        : "px-2 py-0.5 text-muted-foreground hover:text-foreground transition-colors"}`}
                    >
                      All
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[160px] text-center">
                    Only show notes that match <span className="font-semibold">every</span> selected tag
                  </TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>

            {hasSelection && (
              <button
                type="button"
                onClick={() => { onChange([]); setOpen(false); }}
                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors ml-auto"
              >
                Clear all
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
