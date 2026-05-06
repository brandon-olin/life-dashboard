"use client";

import { useState } from "react";
import { $api } from "@/lib/api/query";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Loader2 } from "lucide-react";
import type { components } from "@/lib/api/schema";

type Recipe = components["schemas"]["RecipeResponse"];

type FormState = {
  name: string;
  description: string;
  source_url: string;
  prep_time_minutes: string;
  cook_time_minutes: string;
  servings: string;
  notes: string;
};

function blankForm(): FormState {
  return { name: "", description: "", source_url: "", prep_time_minutes: "", cook_time_minutes: "", servings: "", notes: "" };
}

function formFromRecipe(r: Recipe): FormState {
  return {
    name: r.name,
    description: r.description ?? "",
    source_url: r.source_url ?? "",
    prep_time_minutes: r.prep_time_minutes ? String(r.prep_time_minutes) : "",
    cook_time_minutes: r.cook_time_minutes ? String(r.cook_time_minutes) : "",
    servings: r.servings ? String(r.servings) : "",
    notes: r.notes ?? "",
  };
}

export function RecipeSheet({
  open,
  recipe,
  onClose,
}: {
  open: boolean;
  recipe: Recipe | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const isEdit = recipe !== null;
  const [form, setForm] = useState<FormState>(blankForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setForm(recipe ? formFromRecipe(recipe) : blankForm());
      setError(null);
    }
  }

  const { mutateAsync: createRecipe } = $api.useMutation("post", "/recipes");
  const { mutateAsync: updateRecipe } = $api.useMutation("patch", "/recipes/{recipe_id}");
  const { mutateAsync: deleteRecipe } = $api.useMutation("delete", "/recipes/{recipe_id}");

  function set<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm((p) => ({ ...p, [key]: val }));
  }

  async function handleSave() {
    if (!form.name.trim()) { setError("Name is required."); return; }
    setSaving(true); setError(null);
    try {
      const body = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        source_url: form.source_url.trim() || null,
        prep_time_minutes: form.prep_time_minutes ? Number(form.prep_time_minutes) : null,
        cook_time_minutes: form.cook_time_minutes ? Number(form.cook_time_minutes) : null,
        servings: form.servings ? Number(form.servings) : null,
        notes: form.notes.trim() || null,
      };
      if (isEdit) {
        await updateRecipe({ params: { path: { recipe_id: recipe.id } }, body });
      } else {
        await createRecipe({ body: { ...body, ingredients: [], steps: [] } });
      }
      qc.invalidateQueries({ queryKey: ["get", "/recipes"] });
      onClose();
    } catch { setError("Something went wrong."); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!recipe) return;
    setSaving(true);
    try {
      await deleteRecipe({ params: { path: { recipe_id: recipe.id } } });
      qc.invalidateQueries({ queryKey: ["get", "/recipes"] });
      onClose();
    } finally { setSaving(false); }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto flex flex-col gap-0 p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b">
          <SheetTitle>{isEdit ? "Edit recipe" : "New recipe"}</SheetTitle>
          <SheetDescription className="sr-only">
            {isEdit ? "Update this recipe" : "Add a new recipe"}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="r-name">Name</Label>
            <Input id="r-name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Pasta carbonara" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-desc">Description</Label>
            <Textarea id="r-desc" value={form.description} rows={2} onChange={(e) => set("description", e.target.value)} placeholder="Short description…" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-url">Source URL</Label>
            <Input id="r-url" type="url" value={form.source_url} onChange={(e) => set("source_url", e.target.value)} placeholder="https://…" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="r-prep">Prep (min)</Label>
              <Input id="r-prep" type="number" min="0" value={form.prep_time_minutes} onChange={(e) => set("prep_time_minutes", e.target.value)} placeholder="15" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-cook">Cook (min)</Label>
              <Input id="r-cook" type="number" min="0" value={form.cook_time_minutes} onChange={(e) => set("cook_time_minutes", e.target.value)} placeholder="30" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-serv">Servings</Label>
              <Input id="r-serv" type="number" min="1" value={form.servings} onChange={(e) => set("servings", e.target.value)} placeholder="4" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-notes">Notes</Label>
            <Textarea id="r-notes" value={form.notes} rows={3} onChange={(e) => set("notes", e.target.value)} placeholder="Tips, substitutions, variations…" />
          </div>
        </div>
        <div className="px-6 py-4 border-t flex items-center gap-2">
          {error ? <p className="flex-1 text-sm text-destructive">{error}</p> : <span className="flex-1" />}
          {isEdit && (
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={handleDelete} disabled={saving}>Delete</Button>
          )}
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            {isEdit ? "Save" : "Create"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
