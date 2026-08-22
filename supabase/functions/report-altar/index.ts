// Edge Function: reportar un altar compartido. Incrementa `reported_count`
// en `altars` usando la service role key (el cliente no tiene permiso de
// update directo). Rate limit por IP + una IP no puede reportar el mismo
// altar más de una vez.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RATE_LIMIT = 20; // reportes por IP (en total, cualquier altar)
const WINDOW_MS = 60 * 60 * 1000; // 1 hora
const HIDE_THRESHOLD = 5; // reportes acumulados para ocultar el altar automáticamente

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

  const { data: altar, error: fetchError } = await supabase
    .from("altars")
    .select("slug")
    .eq("slug", slug)
    .maybeSingle();

  if (fetchError || !altar) {
    return json({ error: "El altar no existe." }, 404);
  }

  // Cuenta + reserva el slot + marca (ip, slug) en una sola sentencia
  // atómica (evita que pedidos muy seguidos se pisen).
  const { data: slotResult, error: slotError } = await supabase.rpc("take_report_rate_limit_slot", {
    p_ip: ip,
    p_slug: slug,
    p_window_seconds: WINDOW_MS / 1000,
    p_limit: RATE_LIMIT,
  });

  if (slotError || !slotResult) {
    return json({ error: "No se pudo verificar el límite de uso." }, 500);
  }
  if (slotResult === "rate_limited") {
    return json({ error: "Alcanzaste el límite de reportes por hora. Probá más tarde." }, 429);
  }
  if (slotResult === "duplicate") {
    return json({ error: "Ya reportaste este altar." }, 409);
  }

  // Incremento atómico (una sola sentencia SQL): evita que reportes casi
  // simultáneos se pisen entre sí y el conteo quede corto.
  const { data: result, error: incrementError } = await supabase
    .rpc("increment_altar_report", { p_slug: slug, p_hide_threshold: HIDE_THRESHOLD })
    .single();

  if (incrementError || !result) {
    return json({ error: "No se pudo registrar el reporte." }, 500);
  }

  return json({ ok: true, reportedCount: result.reported_count });
});
