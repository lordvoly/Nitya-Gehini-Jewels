import multer from "multer";
import { UnsupportedFileTypeError } from "./errors.js";

// Shared by both photo-upload routes (item photos, profile photos) so they
// can't silently drift apart the way they had — both previously defined
// their own identical-looking multer() with no fileFilter at all, meaning
// neither actually enforced "image only" despite that being assumed.
//
// The 20MB ceiling is a backstop, not the primary defense — PhotoPicker
// compresses on the frontend before a file ever reaches here, so this only
// matters for whatever gets through compression (or a caller that bypasses
// it, e.g. hitting the API directly). Raised from the old 15MB mainly to
// give a real, uncompressed phone photo more headroom in that fallback
// case, not because compression is expected to need it.
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
]);

export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
      cb(new UnsupportedFileTypeError(`Unsupported file type (${file.mimetype || "unknown"}) — please upload a photo.`));
      return;
    }
    cb(null, true);
  },
});
