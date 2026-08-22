// Edge Function de administración: listar altares reportados/ocultos y
// cambiar su estado a mano. Protegida por un secreto (header
// `x-admin-secret`), NO por RLS ni por login — no expone nada a anon.
// Configurar el secreto con:
//   supabase secrets set ADMIN_SECRET=algo-largo-y-random
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-secret",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const adminSecret = Deno.env.get("ADMIN_SECRET");
  const providedSecret = req.headers.get("x-admin-secret");
  if (!adminSecret || providedSecret !== adminSecret) {
    return json({ error: "No autorizado." }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("altars")
      .select("slug, name, status, reported_count, created_at")
      .or("reported_count.gt.0,status.eq.hidden")
      .order("reported_count", { ascending: false });

    if (error) return json({ error: "No se pudo listar los altares." }, 500);
    return json({ altars: data });
  }

  if (req.method === "POST") {
    let payload: Record<string, unknown>;
    try {
      payload = await req.json();
    } catch {
      return json({ error: "JSON inválido" }, 400);
    }

    const { slug, status } = payload ?? {};
    if (typeof slug !== "string" || !slug) {
      return json({ error: "Falta el slug." }, 400);
    }
    if (status !== "visible" && status !== "hidden") {
      return json({ error: "status debe ser 'visible' u 'hidden'." }, 400);
    }

    const { error } = await supabase.from("altars").update({ status }).eq("slug", slug);
    if (error) return json({ error: "No se pudo actualizar el altar." }, 500);
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, 405);
});
