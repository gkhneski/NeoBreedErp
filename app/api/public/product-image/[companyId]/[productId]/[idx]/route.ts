import { TENANT_FILES_BUCKET } from "@/lib/storage/attachments";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Public, unauthenticated endpoint: serves a product's Trendyol publish image so
// the marketplace can fetch it by URL. These images are meant to be public
// (they become the storefront photo), so no auth is required — but the path is
// strictly validated and limited to the products/<id>/trendyol/<n> prefix.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ companyId: string; productId: string; idx: string }> },
) {
  const { companyId, productId, idx } = await params;
  const n = Number.parseInt(idx, 10);
  if (!UUID.test(companyId) || !UUID.test(productId) || !Number.isInteger(n) || n < 0 || n > 20) {
    return new Response("Bad request", { status: 400 });
  }

  const supabase = createServiceRoleClient();
  const path = `${companyId}/products/${productId}/trendyol/${n}`;
  const { data, error } = await supabase.storage
    .from(TENANT_FILES_BUCKET)
    .download(path);

  if (error || !data) return new Response("Not found", { status: 404 });

  return new Response(data, {
    headers: {
      "Content-Type": data.type || "image/jpeg",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
