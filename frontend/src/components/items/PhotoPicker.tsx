import { useState } from "react";
import { Camera, Image } from "lucide-react";
import { uploadItemPhoto } from "../../lib/items";
import { ApiError } from "../../lib/api";
import { compressImageForUpload } from "../../lib/imageCompression";

// Distinguishes the real cause so the message is actually accurate — the
// backend's global error handler returns 413 for "still too large after
// compression" and 415 for "not an accepted image type" specifically so
// this doesn't have to guess from a generic failure.
function describeUploadError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 413) {
      return "That photo is too large, even after compression — try a smaller one.";
    }
    if (e.status === 415) {
      return e.message || "That file isn't a supported photo type — please upload a JPEG, PNG, WEBP, or HEIC image.";
    }
  }
  return "A photo failed to upload — you can try again or continue without it.";
}

export function PhotoPicker({
  photos,
  onChange,
  hint = "Optional — you can add these later.",
  onUploadingChange,
  uploadFn = uploadItemPhoto,
}: {
  photos: string[];
  onChange: (photos: string[]) => void;
  hint?: string;
  // Fires with the current in-flight upload count — lets a parent (e.g. a
  // "Save" button) block submission until photos have finished uploading.
  onUploadingChange?: (count: number) => void;
  // Defaults to item-photo upload (the original/only caller); pass a
  // different one to point this same picker+preview UI at another upload
  // endpoint entirely (e.g. the profile panel's own photo, a different
  // Storage bucket) without duplicating any of this component.
  uploadFn?: (file: File) => Promise<string>;
}) {
  const [uploadingCount, setUploadingCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  function adjustUploadingCount(delta: number) {
    setUploadingCount((c) => {
      const next = c + delta;
      onUploadingChange?.(next);
      return next;
    });
  }

  async function handleSelect(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    adjustUploadingCount(files.length);
    let current = photos;
    for (const file of Array.from(files)) {
      try {
        const toUpload = await compressImageForUpload(file);
        const url = await uploadFn(toUpload);
        current = [...current, url];
        onChange(current);
      } catch (e) {
        setError(describeUploadError(e));
      } finally {
        adjustUploadingCount(-1);
      }
    }
  }

  function removePhoto(index: number) {
    onChange(photos.filter((_, i) => i !== index));
  }

  return (
    <div>
      {hint && <p className="wizard-hint">{hint}</p>}
      <div className="photo-picker-actions">
        <label className="btn-camera">
          <Camera size={18} strokeWidth={2} aria-hidden="true" /> Take Photo
          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            onChange={(e) => handleSelect(e.target.files)}
            style={{ display: "none" }}
          />
        </label>
        <label className="btn-camera">
          <Image size={18} strokeWidth={2} aria-hidden="true" /> Choose Files
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => handleSelect(e.target.files)}
            style={{ display: "none" }}
          />
        </label>
      </div>
      {error && <p className="wizard-error">{error}</p>}
      <div className="photo-grid">
        {photos.map((url, i) => (
          <div className="photo-thumb" key={url}>
            <img src={url} alt="" />
            <button className="photo-remove" onClick={() => removePhoto(i)} aria-label="Remove photo">
              ×
            </button>
          </div>
        ))}
        {Array.from({ length: uploadingCount }).map((_, i) => (
          <div className="photo-thumb photo-uploading" key={`uploading-${i}`}>
            Uploading…
          </div>
        ))}
      </div>
    </div>
  );
}
