// Edge Function: reportar un mensaje puntual (distinto de reportar el
// altar completo). Incrementa `reported_count` en `messages` con la service
// role key. Rate limit por IP + una IP no puede reportar el mismo mensaje
// más de una vez. Mismo patrón que report-altar.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RATE_LIMIT = 30; // reportes de mensajes por IP (en total) por hora
const WINDOW_MS = 60 * 60 * 1000; // 1 hora
const HIDE_THRESHOLD = 3; // reportes acumulados para ocultar el mensaje

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

  const { messageId } = payload ?? {};
  if (typeof messageId !== "number" || !Number.isFinite(messageId)) {
    return json({ error: "Falta el id del mensaje." }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const ip = getClientIp(req);
  const since = new Date(Date.now() - WINDOW_MS).toISOString();

  const { count, error: countError } = await supabase
    .from("message_report_rate_limits")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .gte("created_at", since);

  if (countError) {
    return json({ error: "No se pudo verificar el límite de uso." }, 500);
  }

  if ((count ?? 0) >= RATE_LIMIT) {
    return json({ error: "Alcanzaste el límite de reportes por hora. Probá más tarde." }, 429);
  }

  const { data: message, error: fetchError } = await supabase
    .from("messages")
    .select("id")
    .eq("id", messageId)
    .maybeSingle();

  if (fetchError || !message) {
    return json({ error: "El mensaje no existe." }, 404);
  }

  const { error: markError } = await supabase
    .from("message_report_rate_limits")
    .insert({ ip, message_id: messageId });
  if (markError) {
    if (markError.code === "23505") {
      return json({ error: "Ya reportaste este mensaje." }, 409);
    }
    return json({ error: "No se pudo registrar el reporte." }, 500);
  }

  const { data: result, error: incrementError } = await supabase
    .rpc("increment_message_report", { p_message_id: messageId, p_hide_threshold: HIDE_THRESHOLD })
    .single();

  if (incrementError || !result) {
    return json({ error: "No se pudo registrar el reporte." }, 500);
  }

  return json({ ok: true, reportedCount: result.reported_count });
});
