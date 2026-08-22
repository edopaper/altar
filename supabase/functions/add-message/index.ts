// Edge Function: único punto para dejar un mensaje en un altar compartido.
// Valida longitud, palabras prohibidas y rate limit por IP, y hace el
// insert con la service role key (el cliente no tiene permiso de insert
// directo). Mismo patrón que `share-altar`.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { containsForbiddenWord } from "../_shared/forbidden-words.ts";

const MAX_MESSAGE_LENGTH = 60;
const MAX_NAME_LENGTH = 20;
const RATE_LIMIT = 10; // mensajes por IP
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

  const { slug, author } = payload ?? {};
  const text = typeof payload?.text === "string" ? payload.text.trim().replace(/\s+/g, " ") : "";

  if (typeof slug !== "string" || !slug) {
    return json({ error: "Falta el slug del altar." }, 400);
  }
  if (!text) {
    return json({ error: "Escribí un mensaje." }, 400);
  }
  if (text.length > MAX_MESSAGE_LENGTH) {
    return json({ error: `Máximo ${MAX_MESSAGE_LENGTH} caracteres.` }, 400);
  }
  if (containsForbiddenWord(text)) {
    return json({ error: "Ese mensaje no se puede publicar." }, 400);
  }

  const rawAuthor = typeof author === "string" ? author.trim().slice(0, MAX_NAME_LENGTH) : "";
  const cleanAuthor = containsForbiddenWord(rawAuthor) ? "" : rawAuthor;

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

  // Cuenta + reserva el slot en una sola sentencia atómica (evita que
  // pedidos muy seguidos se pisen).
  const { data: allowed, error: slotError } = await supabase.rpc("take_message_rate_limit_slot", {
    p_ip: ip,
    p_window_seconds: WINDOW_MS / 1000,
    p_limit: RATE_LIMIT,
  });

  if (slotError) {
    return json({ error: "No se pudo verificar el límite de uso." }, 500);
  }
  if (!allowed) {
    return json({ error: "Alcanzaste el límite de mensajes por hora. Probá más tarde." }, 429);
  }

  const { data: message, error: insertError } = await supabase
    .from("messages")
    .insert({ slug, text, author: cleanAuthor })
    .select("id, text, author, created_at")
    .single();

  if (insertError || !message) {
    return json({ error: "No se pudo guardar el mensaje." }, 500);
  }

  return json({ message });
});
