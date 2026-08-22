// Edge Function: único punto para compartir un altar. Valida el rate limit
// por IP, sube la foto (si hay) y hace el insert/update en `altars`, todo
// con la service role key (el cliente ya no tiene permiso de insert
// directo).
//
// Compartir de nuevo el mismo altar actualiza la misma fila en vez de crear
// una nueva: el cliente guarda `{slug, editToken}` en localStorage tras el
// primer share y los reenvía. `editToken` es un secreto por altar (nunca
// legible por anon/authenticated, ver migración 012) que demuestra que
// quien pide la edición es quien lo compartió originalmente.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { containsForbiddenWord } from "../_shared/forbidden-words.ts";

const RATE_LIMIT = 5; // altares nuevos por IP
const UPDATE_RATE_LIMIT = 30; // actualizaciones (mismo altar) por IP, más laxo
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

  const { name, objects, clothColor, photo, slug: requestedSlug, editToken } = payload ?? {};

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

  // Sube la foto (si hay) al path `${slug}.${ext}`; `upsert` en true permite
  // reemplazar la foto de un altar que ya existe.
  async function uploadPhoto(slug: string, upsert: boolean): Promise<string | null> {
    if (typeof photo !== "string" || !photo) return null;
    const decoded = decodeDataUrl(photo);
    if (!decoded) throw json({ error: "Foto inválida." }, 400);
    if (decoded.bytes.byteLength > PHOTO_MAX_BYTES) {
      throw json({ error: "La foto supera el máximo permitido (5 MB)." }, 400);
    }
    const realType = sniffImageType(decoded.bytes);
    if (!realType) {
      throw json({ error: "La foto debe ser una imagen PNG o JPG válida." }, 400);
    }
    const ext = realType === "image/png" ? "png" : "jpg";
    const path = `${slug}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("altar-photos")
      .upload(path, decoded.bytes, { contentType: realType, upsert });
    if (uploadError) throw json({ error: "No se pudo subir la foto." }, 500);

    const { data: publicUrlData } = supabase.storage.from("altar-photos").getPublicUrl(path);
    return publicUrlData.publicUrl;
  }

  // --- Actualizar un altar ya compartido, si el cliente mandó slug+editToken
  // y coinciden con lo que guardamos al crearlo. No consume el rate limit de
  // altares nuevos, y no toca `status`/`reported_count` (el historial de
  // moderación se conserva aunque se edite el contenido).
  if (typeof requestedSlug === "string" && requestedSlug && typeof editToken === "string" && editToken) {
    const { data: existing, error: fetchError } = await supabase
      .from("altars")
      .select("edit_token")
      .eq("slug", requestedSlug)
      .maybeSingle();

    if (fetchError) {
      return json({ error: "No se pudo actualizar el altar." }, 500);
    }
    if (!existing || existing.edit_token !== editToken) {
      return json(
        { error: "No tenés permiso para editar ese altar.", invalidEditToken: true },
        403,
      );
    }

    // Límite propio para actualizaciones (más laxo que el de creación): sin
    // esto, un loop descontrolado podría pegarle sin freno a esta rama.
    const updateIp = getClientIp(req);
    const { data: updateAllowed, error: updateSlotError } = await supabase.rpc(
      "take_share_update_rate_limit_slot",
      { p_ip: updateIp, p_window_seconds: WINDOW_MS / 1000, p_limit: UPDATE_RATE_LIMIT },
    );
    if (updateSlotError) {
      return json({ error: "No se pudo verificar el límite de uso." }, 500);
    }
    if (!updateAllowed) {
      return json(
        { error: `Límite de ${UPDATE_RATE_LIMIT} actualizaciones por hora alcanzado. Probá de nuevo más tarde.` },
        429,
      );
    }

    let photoUrl: string | null;
    try {
      photoUrl = await uploadPhoto(requestedSlug, true);
    } catch (res) {
      return res as Response;
    }

    const { error: updateError } = await supabase
      .from("altars")
      .update({
        name: (name as string) || "Altar de muertos",
        objects,
        photo_url: photoUrl,
        cloth_color: (clothColor as string) ?? null,
      })
      .eq("slug", requestedSlug);

    if (updateError) {
      return json({ error: "No se pudo actualizar el altar." }, 500);
    }

    return json({ slug: requestedSlug, editToken, updated: true });
  }

  // --- Crear un altar nuevo.
  const ip = getClientIp(req);

  // Cuenta + reserva el slot en una sola sentencia atómica (evita que
  // pedidos muy seguidos se pisen y dejen pasar más de RATE_LIMIT por IP).
  const { data: slot, error: slotError } = await supabase
    .rpc("take_share_rate_limit_slot", {
      p_ip: ip,
      p_window_seconds: WINDOW_MS / 1000,
      p_limit: RATE_LIMIT,
    })
    .single();

  if (slotError || !slot) {
    return json({ error: "No se pudo verificar el límite de uso." }, 500);
  }

  if (!slot.allowed) {
    const retryAfterMinutes = Math.max(1, Math.ceil(slot.retry_after_seconds / 60));
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

  const newEditToken = crypto.randomUUID();

  for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt++) {
    const slug = randomSlug();

    let photoUrl: string | null;
    try {
      photoUrl = await uploadPhoto(slug, false);
    } catch (res) {
      return res as Response;
    }

    const { error: insertError } = await supabase.from("altars").insert({
      slug,
      name: (name as string) || "Altar de muertos",
      objects,
      photo_url: photoUrl,
      cloth_color: (clothColor as string) ?? null,
      edit_token: newEditToken,
    });

    if (!insertError) {
      return json({ slug, editToken: newEditToken, remaining: slot.remaining, limit: RATE_LIMIT });
    }

    if (insertError.code !== "23505") {
      return json({ error: "No se pudo guardar el altar." }, 500);
    }
  }

  return json({ error: "No se pudo generar un slug único, probá de nuevo." }, 500);
});
