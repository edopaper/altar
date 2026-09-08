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

import { readJsonBody } from '../_shared/request-json.js';

const RATE_LIMIT = 5; // altares nuevos por IP
const UPDATE_RATE_LIMIT = 30; // actualizaciones (mismo altar) por IP, más laxo
const WINDOW_MS = 60 * 60 * 1000; // 1 hora
import { isValidScene, cleanObject, isColor } from '../_shared/scene-validation.js';
import { isValidTribute, cleanTribute, tributeTexts } from '../_shared/tribute.js';
const PHOTO_MAX_BYTES = 5 * 1024 * 1024; // 5 MB


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

function decodeDataUrl(dataUrl: string): { bytes: Uint8Array; contentType: string } | null {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
  if (!match) return null;
  if (match[2].length > Math.ceil(PHOTO_MAX_BYTES / 3) * 4) return null;
  try {
    const bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
    return { bytes, contentType: match[1] };
  } catch {
    return null;
  }
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
    payload = await readJsonBody(req);
  } catch (error) {
    const status = error && typeof error === 'object' && 'status' in error && error.status === 413 ? 413 : 400;
    return json({ error: status === 413 ? "El contenido supera el tamaño permitido." : "JSON inválido" }, status);
  }

  if (payload?.action === 'capabilities') return json({ draftProtocol: 2 });

  const { name, objects, clothColor, photo, tribute, slug: requestedSlug, editToken } = payload ?? {};

  if (!isValidScene(objects)) {
    return json({ error: "El altar tiene datos inválidos." }, 400);
  }
  if (name !== undefined && (typeof name !== "string" || name.length > 120)) {
    return json({ error: "Nombre inválido (máximo 120 caracteres)." }, 400);
  }
  if (clothColor !== undefined && clothColor !== null && !isColor(clothColor)) {
    return json({ error: "Color del mantel inválido." }, 400);
  }
  const cleanObjects = (objects as Record<string, unknown>[]).map(cleanObject);
  if (photo !== undefined && photo !== null && typeof photo !== "string") {
    return json({ error: "Foto inválida." }, 400);
  }
  if (typeof name === "string" && containsForbiddenWord(name)) {
    return json({ error: "El nombre del altar contiene una palabra no permitida." }, 400);
  }
  if (!isValidTribute(tribute)) {
    return json({ error: "La dedicatoria tiene datos inválidos o demasiado largos." }, 400);
  }
  const cleanedTribute = cleanTribute(tribute);
  if (tributeTexts(cleanedTribute).some(containsForbiddenWord)) {
    return json({ error: "La dedicatoria contiene una palabra no permitida." }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!bearer) return json({ error: 'Inicia sesión para guardar tus altares.' }, 401);
  const { data: authData, error: authError } = await supabase.auth.getUser(bearer);
  if (authError || !authData.user) return json({ error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }, 401);
  const userId = authData.user.id;

  const action = payload.action ?? 'publish';
  const revision = payload.revision ?? 0;
  if (!['save', 'publish'].includes(action as string) || !Number.isSafeInteger(revision) || (revision as number) < 0) {
    return json({ error: 'Acción o versión inválida.' }, 400);
  }
  if (requestedSlug !== undefined && (typeof requestedSlug !== 'string' || !/^[a-z0-9]{1,64}$/.test(requestedSlug))) {
    return json({ error: 'Identificador inválido.' }, 400);
  }
  const draftId = payload.draftId;
  if (draftId !== undefined && (typeof draftId !== 'string' || !/^[a-f0-9]{32}$/.test(draftId))) return json({ error: 'Identificador de borrador inválido.' }, 400);
  const candidate = requestedSlug || draftId;
  let existing: { owner_id: string | null; edit_token: string | null; photo_url: string | null } | null = null;
  if (candidate) {
    const result = await supabase.from('altars').select('owner_id, edit_token, photo_url').eq('slug', candidate).maybeSingle();
    if (result.error) return json({ error: 'No se pudo cargar el altar.' }, 500);
    existing = result.data;
    if (!existing && requestedSlug) return json({ error: 'Este altar ya no existe.', conflict: true }, 409);
    if (existing && (existing.owner_id ? existing.owner_id !== userId : !editToken || existing.edit_token !== editToken)) {
      return json({ error: 'No tienes permiso para editar este altar.' }, 403);
    }
  }
  // Detect stale versions before validating a photo URL that may belong to an
  // older public snapshot. The commit repeats this check under the row lock.
  if (existing) {
    const { data: draft, error } = await supabase.from('altar_drafts').select('revision').eq('slug', candidate).maybeSingle();
    if (error) return json({ error: 'No se pudo comprobar la versión del borrador.' }, 500);
    if ((draft?.revision ?? 0) !== revision) return json({ error: 'Hay cambios más recientes. Revisa las versiones antes de guardar.', conflict: true }, 409);
  }
  // Private images stay inside the protected draft. Never upload them to the
  // public bucket until publication, and never overwrite a published image.
  let decoded: ReturnType<typeof decodeDataUrl> = null;
  let realType: ReturnType<typeof sniffImageType> = null;
  if (photo && photo !== existing?.photo_url) {
    decoded = decodeDataUrl(photo as string);
    if (!decoded || decoded.bytes.byteLength > PHOTO_MAX_BYTES) return json({ error: 'Foto inválida.' }, 400);
    realType = sniffImageType(decoded.bytes);
    if (!realType) return json({ error: 'La foto debe ser una imagen PNG o JPG válida.' }, 400);
  }
  const ip = getClientIp(req);
  if (existing) {
    const limit = action === 'save' ? 600 : UPDATE_RATE_LIMIT;
    const { data, error } = await supabase.rpc('take_share_update_rate_limit_slot', {
      p_ip: `${ip}:${action}`, p_window_seconds: WINDOW_MS / 1000, p_limit: limit,
    });
    if (error) return json({ error: 'No se pudo verificar el límite de uso.' }, 500);
    if (!data) return json({ error: 'Límite de guardados alcanzado. Intenta más tarde.' }, 429);
  } else {
    const { data, error } = await supabase.rpc('take_share_rate_limit_slot', {
      p_ip: ip, p_window_seconds: WINDOW_MS / 1000, p_limit: RATE_LIMIT,
    }).single<{ allowed: boolean; remaining: number }>();
    if (error || !data) return json({ error: 'No se pudo verificar el límite de uso.' }, 500);
    if (!data.allowed) return json({ error: 'Límite de creación alcanzado. Intenta más tarde.' }, 429);
  }
  const slug = (candidate as string) || crypto.randomUUID().replaceAll('-', '');
  let photoUrl = (photo as string) || null;
  let uploadedPath: string | null = null;
  if (action === 'publish' && decoded && realType) {
    uploadedPath = `${slug}/${crypto.randomUUID()}.${realType === 'image/png' ? 'png' : 'jpg'}`;
    const { error } = await supabase.storage.from('altar-photos').upload(uploadedPath, decoded.bytes, { contentType: realType });
    if (error) return json({ error: 'No se pudo subir la foto.' }, 500);
    photoUrl = supabase.storage.from('altar-photos').getPublicUrl(uploadedPath).data.publicUrl;
  }
  const newEditToken = (editToken as string) || crypto.randomUUID();
  const { data, error } = await supabase.rpc('commit_altar_draft', {
    p_slug: slug, p_user: userId, p_revision: revision,
    p_content: { name: (name as string)?.trim() || 'Mi altar', objects: cleanObjects, photo: photo || null, clothColor: clothColor ?? null, tribute: cleanedTribute },
    p_publish: action === 'publish', p_photo_url: photoUrl, p_edit_token: newEditToken,
  });
  if (error) {
    if (uploadedPath) await supabase.storage.from('altar-photos').remove([uploadedPath]);
    if (error.code === '40001' || error.code === '23505') return json({ error: 'Hay cambios más recientes. Revisa las versiones antes de guardar.', conflict: true }, 409);
    if (error.code === 'P0001') return json({ error: 'Ya tienes 3 altares. Elimina uno desde Mis altares para guardar otro.' }, 409);
    return json({ error: 'No se pudo guardar el altar.' }, 500);
  }
  return json({ ...data, editToken: newEditToken, updated: Boolean(existing) });
});
