import { supabase } from "./supabase.js";

const MAX_DIMENSION = 1024;   // px on longest side — same budget as the vision-call resize
const JPEG_QUALITY = 0.85;

/**
 * Downscale an image File to {@link MAX_DIMENSION} on its longest side and re-encode
 * as a JPEG Blob. Shared shrink step for durable uploads (avatars, post photos) so a
 * 12-megapixel phone photo doesn't go to Storage at full size. Mirrors the base64
 * resize in lib/api.js (which feeds the vision API) but yields a Blob for upload.
 */
export async function resizeImageToBlob(file) {
  if (!file.type || !file.type.startsWith("image/")) return file;
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(img, 0, 0, w, h);
    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", JPEG_QUALITY));
    return blob || file;
  } catch {
    return file;   // fall back to the original if canvas isn't available
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Resize + upload an image to a PUBLIC Supabase Storage bucket under the user's own
 * prefix ("{user.id}/{uuid}.jpg") — matching the Storage RLS that only lets a user
 * write under their own folder. Returns the public URL. Uploads go straight from the
 * browser (supabase-js + the user's JWT); they never pass through the backend/Lambda.
 */
export async function uploadImage(bucket, file) {
  // getSession reads the local session (refreshing only if expired) instead of hitting
  // /auth/v1/user on every upload: one less network round-trip that can fail mid-save
  // and, on a session_not_found answer, sign the user out. Storage RLS still pins the
  // folder to auth.uid(), so a stale local id can't write anywhere else.
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) throw new Error("Sessão expirada. Entre de novo.");
  const blob = await resizeImageToBlob(file);
  const path = `${user.id}/${crypto.randomUUID()}.jpg`;
  const publicUrl = supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  const upload = supabase.storage.from(bucket).upload(path, blob, {
    contentType: "image/jpeg",
    upsert: false,
  });
  return settleUpload(upload, publicUrl);
}

// Supabase Storage sometimes stores the object right away but holds the HTTP response
// for 10–60 s (seen 2026-11-02; iOS gives up at ~60 s → the photo "failed" while the file
// was already in the bucket). So if the upload is slow, poll the public URL and treat the
// object showing up as success. Buckets using uploadImage are all public.
const SLOW_UPLOAD_MS = 4000;
const POLL_EVERY_MS = 2000;
const GIVE_UP_MS = 45000;

function settleUpload(upload, publicUrl) {
  return new Promise((resolve, reject) => {
    let done = false;
    let pollTimer = null;
    const started = Date.now();
    const finish = (fn, v) => {
      if (done) return;
      done = true;
      clearTimeout(pollTimer);
      fn(v);
    };
    const poll = async () => {
      if (done) return;
      if (await isPublic(publicUrl)) return finish(resolve, publicUrl);
      if (Date.now() - started > GIVE_UP_MS) {
        return finish(reject, new Error("tempo esgotado enviando a foto"));
      }
      pollTimer = setTimeout(poll, POLL_EVERY_MS);
    };
    pollTimer = setTimeout(poll, SLOW_UPLOAD_MS);

    upload.then(
      async ({ error }) => {
        if (!error) return finish(resolve, publicUrl);
        // A network-level failure may still have landed the object; a real rejection (RLS, size) won't.
        if (await isPublic(publicUrl)) return finish(resolve, publicUrl);
        finish(reject, error);
      },
      async (e) => {
        if (await isPublic(publicUrl)) return finish(resolve, publicUrl);
        finish(reject, e);
      },
    );
  });
}

async function isPublic(url) {
  try {
    // Cache-buster: an early 404 must not be served from the CDN on the next poll.
    const res = await fetch(`${url}?check=${Date.now()}`, { method: "HEAD", cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

/** Object path ("{uid}/{uuid}.jpg") of a public URL in {@code bucket}, or null if it isn't one. */
export function storagePath(bucket, url) {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const i = url ? url.indexOf(marker) : -1;
  return i < 0 ? null : decodeURIComponent(url.slice(i + marker.length));
}

/** Best-effort delete of uploaded images by public URL. Never throws: orphans are acceptable. */
export async function removeImages(bucket, urls) {
  const paths = (urls || []).map((u) => storagePath(bucket, u)).filter(Boolean);
  if (!paths.length) return;
  try { await supabase.storage.from(bucket).remove(paths); } catch { /* best-effort */ }
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}
