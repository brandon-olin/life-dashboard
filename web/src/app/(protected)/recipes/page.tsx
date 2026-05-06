"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { $api } from "@/lib/api/query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RecipeSheet } from "@/components/recipes/recipe-sheet";
import { cn } from "@/lib/utils";
import { Plus, Loader2, ChefHat, Clock, ExternalLink, Search } from "lucide-react";
import type { components } from "@/lib/api/schema";

type Recipe = components["schemas"]["RecipeResponse"];

function formatTime(mins: number | null): string | null {
  if (!mins) return null;
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function RecipeCard({ recipe, onClick }: { recipe: Recipe; onClick: () => void }) {
  const totalMins = (recipe.prep_time_minutes ?? 0) + (recipe.cook_time_minutes ?? 0);
  const timeStr = formatTime(totalMins || null);

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left border rounded-lg p-4 bg-card hover:bg-muted/30 transition-colors group"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium text-sm leading-snug">{recipe.name}</span>
        {recipe.source_url && (
          <a
            href={recipe.source_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
      {recipe.description && (
        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{recipe.description}</p>
      )}
      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
        {timeStr && (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />{timeStr}
          </span>
        )}
        {recipe.servings && <span>{recipe.servings} servings</span>}
        {(recipe.ingredients.length > 0 || recipe.steps.length > 0) && (
          <span className="text-muted-foreground/60">
            {recipe.ingredients.length} ing · {recipe.steps.length} steps
          </span>
        )}
      </div>
    </button>
  );
}

export default function RecipesPage() {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data, isLoading, isError } = $api.useQuery("get", "/recipes", {
    params: { query: { limit: 200 } },
  });

  const q = search.toLowerCase();
  const displayed = (data?.items ?? []).filter(
    (r) => !q || r.name.toLowerCase().includes(q) || r.description?.toLowerCase().includes(q)
  );

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <ChefHat className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-xl font-semibold">Recipes</h1>
        </div>
        <Button size="sm" onClick={() => setSheetOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />New
        </Button>
      </div>

      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search recipes…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />Loading…
        </div>
      )}
      {isError && <p className="py-8 text-sm text-destructive">Failed to load recipes.</p>}
      {!isLoading && !isError && displayed.length === 0 && (
        <div className="py-12 text-center">
          <ChefHat className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            {search ? "No recipes match that search." : "No recipes yet."}
          </p>
          {!search && (
            <Button variant="outline" size="sm" className="mt-4" onClick={() => setSheetOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />Add one
            </Button>
          )}
        </div>
      )}
      {displayed.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {displayed.map((r) => (
            <RecipeCard
              key={r.id}
              recipe={r}
              onClick={() => router.push(`/recipes/${r.id}`)}
            />
          ))}
        </div>
      )}

      {/* New recipe sheet — no editing here, edit from detail page */}
      <RecipeSheet open={sheetOpen} recipe={null} onClose={() => setSheetOpen(false)} />
    </div>
  );
}
