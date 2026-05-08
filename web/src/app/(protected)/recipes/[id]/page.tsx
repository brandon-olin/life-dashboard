"use client";

import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { $api } from "@/lib/api/query";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { RecipeSheet } from "@/components/recipes/recipe-sheet";
import { Loader2, ArrowLeft, ExternalLink, Clock, Users, Edit } from "lucide-react";
import type { components } from "@/lib/api/schema";

type Recipe = components["schemas"]["RecipeResponse"];

const RecipeBodyEditor = dynamic(
  () => import("@/components/recipes/recipe-body-editor").then((m) => m.RecipeBodyEditor),
  { ssr: false, loading: () => <div className="h-32 flex items-center justify-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" />Loading editor…</div> }
);

function formatTime(mins: number | null): string | null {
  if (!mins) return null;
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function RecipeHeader({ recipe, onEdit }: { recipe: Recipe; onEdit: () => void }) {
  const totalMins = (recipe.prep_time_minutes ?? 0) + (recipe.cook_time_minutes ?? 0);
  const timeStr = formatTime(totalMins || null);

  return (
    <div className="space-y-4">
      {/* Cover image */}
      {recipe.cover_image_url && (
        <div className="w-full rounded-xl overflow-hidden" style={{ maxHeight: "320px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={recipe.cover_image_url}
            alt={recipe.name}
            className="w-full h-full object-cover"
            style={{ maxHeight: "320px" }}
          />
        </div>
      )}

      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold leading-tight">{recipe.name}</h1>
        <div className="flex items-center gap-2 shrink-0">
          {recipe.source_url && (
            <a
              href={recipe.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-md hover:bg-muted transition-colors"
            >
              <ExternalLink className="h-4 w-4" />Source
            </a>
          )}
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Edit className="h-4 w-4 mr-1.5" />Edit
          </Button>
        </div>
      </div>

      {recipe.description && (
        <p className="text-muted-foreground">{recipe.description}</p>
      )}

      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        {timeStr && (
          <span className="flex items-center gap-1.5">
            <Clock className="h-4 w-4" />{timeStr}
          </span>
        )}
        {recipe.prep_time_minutes && (
          <span>Prep: {formatTime(recipe.prep_time_minutes)}</span>
        )}
        {recipe.cook_time_minutes && (
          <span>Cook: {formatTime(recipe.cook_time_minutes)}</span>
        )}
        {recipe.servings && (
          <span className="flex items-center gap-1.5">
            <Users className="h-4 w-4" />{recipe.servings} servings
          </span>
        )}
      </div>
    </div>
  );
}

function IngredientsList({ recipe }: { recipe: Recipe }) {
  if (!recipe.ingredients.length) return null;
  return (
    <div>
      <h2 className="text-base font-semibold mb-3">Ingredients</h2>
      <ul className="space-y-1.5">
        {recipe.ingredients.map((ing) => (
          <li key={ing.id} className="flex items-baseline gap-2 text-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 shrink-0 mt-1.5" />
            <span>
              {ing.quantity && <span className="font-medium">{String(ing.quantity)}{ing.unit ? ` ${ing.unit}` : ""} </span>}
              {ing.name}
              {ing.notes && <span className="text-muted-foreground"> — {ing.notes}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StepsList({ recipe }: { recipe: Recipe }) {
  if (!recipe.steps.length) return null;
  return (
    <div>
      <h2 className="text-base font-semibold mb-3">Instructions</h2>
      <ol className="space-y-4">
        {recipe.steps.map((step) => (
          <li key={step.id} className="flex gap-4 text-sm">
            <span className="flex-none w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground">
              {step.step_number}
            </span>
            <div className="flex-1 pt-0.5">
              <p>{step.instruction}</p>
              {step.notes && <p className="mt-1 text-muted-foreground text-xs">{step.notes}</p>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function RecipeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data: recipe, isLoading, isError } = $api.useQuery(
    "get",
    "/recipes/{recipe_id}",
    { params: { path: { recipe_id: id } } }
  );

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />Loading…
      </div>
    );
  }

  if (isError || !recipe) {
    return <p className="p-8 text-sm text-destructive">Recipe not found.</p>;
  }

  return (
    <div className="p-6 max-w-3xl">
      {/* Back */}
      <button
        type="button"
        onClick={() => router.push("/recipes")}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4" />Back to recipes
      </button>

      {/* Header: name, times, actions */}
      <RecipeHeader recipe={recipe} onEdit={() => setSheetOpen(true)} />

      <div className="mt-8 space-y-8">
        {/* Structured sections */}
        <IngredientsList recipe={recipe} />
        <StepsList recipe={recipe} />

        {/* Notes */}
        {recipe.notes && (
          <div>
            <h2 className="text-base font-semibold mb-2">Notes</h2>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{recipe.notes}</p>
          </div>
        )}

        {/* Divider before rich body */}
        {(recipe.ingredients.length > 0 || recipe.steps.length > 0) && (
          <hr className="border-border" />
        )}

        {/* BlockNote body — freeform rich text */}
        <div>
          <h2 className="text-base font-semibold mb-3">Notes &amp; Story</h2>
          <RecipeBodyEditor recipeId={id} initialBody={recipe.body} />
        </div>
      </div>

      <RecipeSheet
        open={sheetOpen}
        recipe={recipe}
        onClose={() => {
          setSheetOpen(false);
          qc.invalidateQueries({ queryKey: ["get", "/recipes/{recipe_id}"] });
        }}
        onDeleted={() => router.push("/recipes")}
      />
    </div>
  );
}
