// Edge Function: único punto para compartir un altar. Valida el rate limit
// por IP, sube la foto (si hay) y hace el insert en `altars`, todo con la
// service role key (el cliente ya no tiene permiso de insert directo).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RATE_LIMIT = 5; // altares por IP
const WINDOW_MS = 60 * 60 * 1000; // 1 hora
const MAX_OBJECTS = 150;
const PHOTO_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const SLUG_ATTEMPTS = 5;

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

function randomSlug() {
  return Math.random().toString(36).slice(2, 7);
}

function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") ?? "unknown";
}

function decodeDataUrl(dataUrl: string): { bytes: Uint8Array; contentType: string } | null {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
  if (!match) return null;
  const bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
  return { bytes, contentType: match[1] };
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

  const { name, objects, clothColor, photo } = payload ?? {};

  if (!Array.isArray(objects) || objects.length > MAX_OBJECTS) {
    return json({ error: "El altar tiene datos inválidos." }, 400);
  }
  if (photo !== undefined && photo !== null && typeof photo !== "string") {
    return json({ error: "Foto inválida." }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const ip = getClientIp(req);
  const since = new Date(Date.now() - WINDOW_MS).toISOString();

  const { data: recent, error: countError } = await supabase
    .from("share_rate_limits")
    .select("created_at")
    .eq("ip", ip)
    .gte("created_at", since)
    .order("created_at", { ascending: true });

  if (countError) {
    return json({ error: "No se pudo verificar el límite de uso." }, 500);
  }

  const count = recent?.length ?? 0;
  if (count >= RATE_LIMIT) {
    const oldest = new Date(recent[0].created_at).getTime();
    const retryAfterMinutes = Math.max(1, Math.ceil((oldest + WINDOW_MS - Date.now()) / 60000));
    return json(
      {
        error: `Límite de ${RATE_LIMIT} altares compartidos por hora alcanzado. Probá de nuevo en ${retryAfterMinutes} min.`,
        limit: RATE_LIMIT,
        remaining: 0,
        retryAfterMinutes,
      },
      429,
    );
  }

  let photoUrl: string | null = null;

  for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt++) {
    const slug = randomSlug();

    if (typeof photo === "string" && photo && !photoUrl) {
      const decoded = decodeDataUrl(photo);
      if (!decoded) return json({ error: "Foto inválida." }, 400);
      if (decoded.bytes.byteLength > PHOTO_MAX_BYTES) {
        return json({ error: "La foto supera el máximo permitido (5 MB)." }, 400);
      }
      const ext = decoded.contentType === "image/png" ? "png" : "jpg";
      const path = `${slug}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("altar-photos")
        .upload(path, decoded.bytes, { contentType: decoded.contentType, upsert: false });
      if (uploadError) return json({ error: "No se pudo subir la foto." }, 500);

      const { data: publicUrlData } = supabase.storage.from("altar-photos").getPublicUrl(path);
      photoUrl = publicUrlData.publicUrl;
    }

    const { error: insertError } = await supabase.from("altars").insert({
      slug,
      name: (name as string) || "Altar de muertos",
      objects,
      photo_url: photoUrl,
      cloth_color: (clothColor as string) ?? null,
    });

    if (!insertError) {
      await supabase.from("share_rate_limits").insert({ ip });
      const remaining = Math.max(0, RATE_LIMIT - (count + 1));
      return json({ slug, remaining, limit: RATE_LIMIT });
    }

    if (insertError.code !== "23505") {
      return json({ error: "No se pudo guardar el altar." }, 500);
    }
  }

  return json({ error: "No se pudo generar un slug único, probá de nuevo." }, 500);
});
