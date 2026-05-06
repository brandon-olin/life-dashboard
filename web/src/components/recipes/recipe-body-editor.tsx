"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { $api } from "@/lib/api/query";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import { Check, Loader2 } from "lucide-react";
import type { Block } from "@blocknote/core";
import { useThemeCustomizer } from "@/lib/theme/context";
import { BASE_THEMES } from "@/lib/theme/presets";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/shadcn/style.css";

type SaveState = "idle" | "saving" | "saved";

function EditorInner({
  recipeId,
  initialBody,
}: {
  recipeId: string;
  initialBody: Record<string, unknown> | null;
}) {
  const qc = useQueryClient();
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { mutateAsync: patchRecipe } = $api.useMutation("patch", "/recipes/{recipe_id}");

  // Derive dark/light from the active base theme so BlockNote's
  // data-color-scheme attribute stays in sync with the app theme.
  const { config } = useThemeCustomizer();
  const activeBase = BASE_THEMES.find((t) => t.id === config.baseThemeId);
  const bnTheme: "light" | "dark" = activeBase?.category === "dark" ? "dark" : "light";

  const editor = useCreateBlockNote();

  // Populate editor once from initialBody
  const initialised = useRef(false);
  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;
    const blocks = (initialBody as { blocks?: Block[] } | null)?.blocks;
    if (blocks?.length) {
      editor.replaceBlocks(editor.document, blocks);
    }
  }, [initialBody, editor]);

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaveState("saving");
      try {
        const blocks = editor.document;
        await patchRecipe({
          params: { path: { recipe_id: recipeId } },
          body: { body: { blocks } },
        });
        qc.invalidateQueries({ queryKey: ["get", "/recipes/{recipe_id}"] });
        setSaveState("saved");
        setTimeout(() => setSaveState("idle"), 2000);
      } catch {
        setSaveState("idle");
      }
    }, 1000);
  }, [editor, patchRecipe, qc, recipeId]);

  return (
    <div className="relative">
      {/* Save indicator */}
      <div className="absolute top-0 right-0 flex items-center gap-1 text-xs text-muted-foreground z-10 h-6">
        {saveState === "saving" && <><Loader2 className="h-3 w-3 animate-spin" />Saving…</>}
        {saveState === "saved" && <><Check className="h-3 w-3 text-primary" />Saved</>}
      </div>

      <div className="-mx-[54px]">
        <BlockNoteView
          editor={editor}
          theme={bnTheme}
          onChange={scheduleSave}
        />
      </div>
    </div>
  );
}

export function RecipeBodyEditor({
  recipeId,
  initialBody,
}: {
  recipeId: string;
  initialBody: Record<string, unknown> | null;
}) {
  return <EditorInner key={recipeId} recipeId={recipeId} initialBody={initialBody} />;
}
