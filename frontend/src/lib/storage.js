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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("not signed in");
  const blob = await resizeImageToBlob(file);
  const path = `${user.id}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(bucket).upload(path, blob, {
    contentType: "image/jpeg",
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}
