import { handleHostedDemo } from "@/lib/hosted-demo";
import { hostedDemo } from "@/lib/runtime-mode";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  if (!hostedDemo()) return Response.json({ error: "Hosted demo is disabled." }, { status: 404 });
  return handleHostedDemo(request);
}
