// Edge Function: único punto para compartir un altar. Valida el rate limit
// por IP, sube la foto (si hay) y hace el insert en `altars`, todo con la
// service role key (el cliente ya no tiene permiso de insert directo).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { containsForbiddenWord } from "./forbidden-words.ts";

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

// Detecta el formato real de la imagen a partir de sus primeros bytes
// (magic numbers), sin confiar en el content-type declarado por el cliente.
function sniffImageType(bytes: Uint8Array): "image/png" | "image/jpeg" | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  return null;
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
  if (typeof name === "string" && containsForbiddenWord(name)) {
    return json({ error: "El nombre del altar contiene una palabra no permitida." }, 400);
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
      const realType = sniffImageType(decoded.bytes);
      if (!realType) {
        return json({ error: "La foto debe ser una imagen PNG o JPG válida." }, 400);
      }
      const ext = realType === "image/png" ? "png" : "jpg";
      const path = `${slug}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("altar-photos")
        .upload(path, decoded.bytes, { contentType: realType, upsert: false });
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
