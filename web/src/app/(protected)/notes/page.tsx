"use client";

import { BookOpen, Plus, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotesPage() {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Notes</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" disabled>
            <Tag className="h-4 w-4" />
            Tags
          </Button>
          <Button size="sm" className="gap-2" disabled>
            <Plus className="h-4 w-4" />
            New note
          </Button>
        </div>
      </div>

      {/* Empty state */}
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
          <BookOpen className="h-6 w-6 text-muted-foreground" />
        </div>
        <div>
          <p className="font-medium mb-1">Zettelkasten notes</p>
          <p className="text-sm text-muted-foreground max-w-sm">
            Atomic, interlinked notes with tags and{" "}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">[[wikilink]]</code>{" "}
            backlinks. The full UI is coming soon — the data model and API are ready.
          </p>
        </div>
      </div>
    </div>
  );
}
