// Thrown by the shared image-upload multer config (lib/upload.ts) when a
// file's mimetype isn't an accepted image type. Caught by the global error
// handler in index.ts and turned into a specific 415 response — distinct
// from multer's own file-too-large error — so the frontend can show the
// right message for the right cause instead of one generic failure string.
export class UnsupportedFileTypeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedFileTypeError";
  }
}
