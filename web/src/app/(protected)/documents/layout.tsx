"use client";

import { useResizablePanel } from "@/lib/hooks/use-resizable-panel";
import { PageTree } from "@/components/documents/page-tree";

export default function DocumentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { width, startResize } = useResizablePanel({
    defaultWidth: 240,
    minWidth: 160,
    maxWidth: 480,
    storageKey: "ld-doc-tree-width",
  });

  return (
    <div className="flex h-full min-h-full">
      {/* Document tree sidebar */}
      <aside
        className="shrink-0 border-r flex flex-col overflow-hidden"
        style={{ width }}
      >
        <PageTree />
      </aside>

      {/* Resize handle */}
      <div
        className="w-1 shrink-0 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors"
        onMouseDown={startResize}
      />

      {/* Main content */}
      <main className="flex-1 min-w-0 overflow-auto">{children}</main>
    </div>
  );
}
