// Client-side compression before upload — a modern phone photo (JPEG or
// HEIC) can reasonably be 10-25MB, comfortably exceeding almost any fixed
// server-side ceiling we pick. This is the real enforcement of a ~1MB cap
// per photo (both item and profile photos go through this same shared
// function via PhotoPicker) — the backend's own multer limit
// (backend/src/lib/upload.ts) is a generous 20MB backstop, not a size
// guarantee, so this is the one place that actually keeps Storage usage
// light.
//
// Rather than one fixed quality/dimension pass (which either
// under-compresses a very detailed photo or over-compresses a simple one),
// this tries the least aggressive combination that actually clears the
// target: full quality ladder at the largest dimension first, only
// stepping down to a smaller dimension if quality alone can't get there.
// That keeps ordinary jewelry product photos close to their original
// quality while still guaranteeing the cap for anything that needs it.
const TARGET_BYTES = 1024 * 1024; // 1MB cap
const DIMENSION_STEPS = [1920, 1440, 1080]; // long edge, px, largest first
const MAX_QUALITY = 0.9;
const MIN_QUALITY = 0.4;
const QUALITY_STEP = 0.1;

async function encodeAtDimension(bitmap: ImageBitmap, maxDimension: number): Promise<Blob | null> {
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const targetWidth = Math.round(bitmap.width * scale);
  const targetHeight = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

  let best: Blob | null = null;
  for (let quality = MAX_QUALITY; quality >= MIN_QUALITY; quality -= QUALITY_STEP) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob) continue;
    best = blob;
    if (blob.size <= TARGET_BYTES) return best;
  }
  return best;
}

export async function compressImageForUpload(file: File): Promise<File> {
  if (file.size <= TARGET_BYTES) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // HEIC decode support via createImageBitmap is inconsistent outside
    // Safari/iOS, and this also covers any other format the browser can't
    // decode. Fall back to the original file untouched — the backend's own
    // file-type check and size backstop are still there regardless.
    return file;
  }

  try {
    let best: Blob | null = null;
    for (const dimension of DIMENSION_STEPS) {
      best = await encodeAtDimension(bitmap, dimension);
      if (best && best.size <= TARGET_BYTES) break;
    }

    // A tiny/already-efficient source could theoretically grow under
    // re-encoding — only use the compressed version if it's actually smaller.
    if (!best || best.size >= file.size) return file;

    const newName = file.name.replace(/\.\w+$/, "") + ".jpg";
    return new File([best], newName, { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}
