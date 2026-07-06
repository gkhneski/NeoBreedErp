"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";

import type { RecipeActionState } from "../actions";

const initialState: RecipeActionState = {};

export function RecipeActionButton({
  action,
  label,
  variant,
  className,
}: {
  action: (
    prev: RecipeActionState,
    formData: FormData,
  ) => Promise<RecipeActionState>;
  label: string;
  variant?: "default" | "outline" | "destructive" | "ghost";
  className?: string;
}) {
  const [state, formAction] = useActionState(action, initialState);

  return (
    <form action={formAction} className={className}>
      <Button type="submit" size="sm" variant={variant}>
        {label}
      </Button>
      {state.error ? (
        <p className="mt-1 max-w-xs text-right text-xs text-destructive">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
