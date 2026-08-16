// Client-side compression before upload — a modern phone photo (JPEG or
// HEIC) can reasonably be 10-25MB, comfortably exceeding almost any fixed
// server-side ceiling we pick. Resizing to a sane max dimension and
// re-encoding as JPEG gets a real phone photo down to a size that's fast
// to upload and well within the backend's own backstop limit, without the
// user ever needing to think about it — this is the real fix, not a
// higher server-side number alone.
const MAX_DIMENSION = 1920; // long edge, px — generous for on-screen/print use
const JPEG_QUALITY = 0.82;
// Below this, compressing is pure overhead (decode + re-encode time) for
// no real benefit — already well under any size limit that matters here.
const SKIP_COMPRESSION_UNDER_BYTES = 1.5 * 1024 * 1024;

export async function compressImageForUpload(file: File): Promise<File> {
  if (file.size < SKIP_COMPRESSION_UNDER_BYTES) return file;

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
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const targetWidth = Math.round(bitmap.width * scale);
    const targetHeight = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    // A tiny/already-efficient source could theoretically grow under
    // re-encoding — only use the compressed version if it's actually smaller.
    if (!blob || blob.size >= file.size) return file;

    const newName = file.name.replace(/\.\w+$/, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}
