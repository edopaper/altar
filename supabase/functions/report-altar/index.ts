// Edge Function: reportar un altar compartido. Incrementa `reported_count`
// en `altars` usando la service role key (el cliente no tiene permiso de
// update directo). Rate limit por IP + una IP no puede reportar el mismo
// altar más de una vez.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RATE_LIMIT = 20; // reportes por IP (en total, cualquier altar)
const WINDOW_MS = 60 * 60 * 1000; // 1 hora

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") ?? "unknown";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }

  const { slug } = payload ?? {};
  if (typeof slug !== "string" || !slug) {
    return json({ error: "Falta el slug del altar." }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const ip = getClientIp(req);
  const since = new Date(Date.now() - WINDOW_MS).toISOString();

  const { count, error: countError } = await supabase
    .from("report_rate_limits")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .gte("created_at", since);

  if (countError) {
    return json({ error: "No se pudo verificar el límite de uso." }, 500);
  }

  if ((count ?? 0) >= RATE_LIMIT) {
    return json({ error: "Alcanzaste el límite de reportes por hora. Probá más tarde." }, 429);
  }

  const { data: altar, error: fetchError } = await supabase
    .from("altars")
    .select("reported_count")
    .eq("slug", slug)
    .maybeSingle();

  if (fetchError || !altar) {
    return json({ error: "El altar no existe." }, 404);
  }

  const { error: markError } = await supabase.from("report_rate_limits").insert({ ip, slug });
  if (markError) {
    // Índice único (ip, slug): ya lo había reportado antes.
    if (markError.code === "23505") {
      return json({ error: "Ya reportaste este altar." }, 409);
    }
    return json({ error: "No se pudo registrar el reporte." }, 500);
  }

  const newCount = altar.reported_count + 1;
  const { error: updateError } = await supabase
    .from("altars")
    .update({ reported_count: newCount })
    .eq("slug", slug);
  if (updateError) {
    return json({ error: "No se pudo registrar el reporte." }, 500);
  }

  return json({ ok: true, reportedCount: newCount });
});
