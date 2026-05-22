"use client";

import Image from "next/image";
import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  uploadProductThumbnail,
  type ProductThumbnailState,
} from "../../actions";

const INITIAL: ProductThumbnailState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Yükleniyor..." : "Thumbnail Yükle"}
    </Button>
  );
}

export function ProductThumbnailForm({
  companyId,
  productId,
  thumbnailUrl,
}: {
  companyId: string;
  productId: string;
  thumbnailUrl?: string | null;
}) {
  const [state, formAction] = useActionState(
    uploadProductThumbnail.bind(null, companyId, productId),
    INITIAL,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-3 rounded-md border border-border bg-card/40 p-4"
    >
      <div className="flex items-center gap-3">
        <div className="relative h-16 w-16 overflow-hidden rounded-md border border-border bg-secondary">
          {thumbnailUrl ? (
            <Image
              src={thumbnailUrl}
              alt=""
              fill
              sizes="64px"
              className="object-cover"
              unoptimized
            />
          ) : null}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <Label htmlFor="thumbnail">Ürün thumbnail</Label>
          <Input
            id="thumbnail"
            name="thumbnail"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            required
          />
          <p className="text-xs text-muted-foreground">
            JPG, PNG veya WEBP. Liste için küçük görsel; en fazla 2 MB.
          </p>
        </div>
      </div>

      {state.error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600">
          Thumbnail yüklendi.
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
