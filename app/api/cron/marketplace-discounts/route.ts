import { runDiscountDetection } from "@/lib/marketplaces/discount-engine";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const service = createServiceRoleClient();
  const summary = await runDiscountDetection(service);
  return Response.json(summary);
}
