import { dispatch } from "@/lib/request-handler";
import { hostedDemo } from "@/lib/runtime-mode";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function route(...args: Parameters<typeof dispatch>) {
  if (hostedDemo()) return Response.json({ error: "Use the browser demo transport." }, { status: 404 });
  return dispatch(...args);
}
export { route as GET, route as POST, route as PATCH };
