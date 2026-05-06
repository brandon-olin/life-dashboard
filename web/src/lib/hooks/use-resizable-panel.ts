"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Options {
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  storageKey: string;
}

/**
 * Returns the current panel width and a mousedown handler to attach to a
 * drag handle element. Width is persisted to localStorage.
 */
export function useResizablePanel({ defaultWidth, minWidth, maxWidth, storageKey }: Options) {
  const [width, setWidth] = useState<number>(() => {
    if (typeof window === "undefined") return defaultWidth;
    const stored = localStorage.getItem(storageKey);
    const parsed = stored ? parseInt(stored, 10) : NaN;
    return isNaN(parsed) ? defaultWidth : Math.min(maxWidth, Math.max(minWidth, parsed));
  });

  // Keep a ref so the mousemove closure always has the latest min/max.
  const constraintsRef = useRef({ minWidth, maxWidth });
  useEffect(() => { constraintsRef.current = { minWidth, maxWidth }; }, [minWidth, maxWidth]);

  // Persist whenever width changes.
  useEffect(() => {
    localStorage.setItem(storageKey, String(width));
  }, [width, storageKey]);

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;

    const onMouseMove = (ev: MouseEvent) => {
      const { minWidth, maxWidth } = constraintsRef.current;
      const next = Math.min(maxWidth, Math.max(minWidth, startWidth + ev.clientX - startX));
      setWidth(next);
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [width]);

  return { width, startResize };
}
