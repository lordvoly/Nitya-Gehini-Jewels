import { useState } from "react";
import { uploadItemPhoto } from "../../lib/items";

export function PhotoPicker({
  photos,
  onChange,
  hint = "Optional — you can add these later.",
  onUploadingChange,
}: {
  photos: string[];
  onChange: (photos: string[]) => void;
  hint?: string;
  // Fires with the current in-flight upload count — lets a parent (e.g. a
  // "Save" button) block submission until photos have finished uploading.
  onUploadingChange?: (count: number) => void;
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
        const url = await uploadItemPhoto(file);
        current = [...current, url];
        onChange(current);
      } catch {
        setError("A photo failed to upload — you can try again or continue without it.");
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
          📷 Take Photo
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
          🖼️ Choose Files
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
