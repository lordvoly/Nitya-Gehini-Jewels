import { useState } from "react";
import { uploadItemPhoto } from "../../lib/items";

export function PhotoPicker({
  photos,
  onChange,
  hint = "Optional — you can add or update photos at any time.",
  onUploadingChange,
}: {
  photos: string[];
  onChange: (photos: string[]) => void;
  hint?: string;
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
        setError("A photo failed to upload — please try again or check connection.");
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
      {hint && <p className="text-muted small mb-3">{hint}</p>}

      {/* Upload Dropzone Box */}
      <div className="upload-box mb-3 position-relative">
        <input
          type="file"
          accept="image/*"
          multiple
          className="position-absolute top-0 start-0 w-100 h-100 opacity-0 cursor-pointer"
          onChange={(e) => handleSelect(e.target.files)}
        />
        <div className="text-center py-3">
          <div className="avatar avatar-md rounded-circle bg-primary-subtle text-primary mx-auto mb-2 d-flex align-items-center justify-content-center">
            <i className="ti ti-cloud-upload fs-3"></i>
          </div>
          <h6 className="fw-semibold text-dark mb-1">Click or drag photos to upload</h6>
          <span className="text-muted fs-7">Supports JPG, PNG, WEBP images</span>
        </div>
      </div>

      <div className="d-flex gap-2 mb-3">
        <label className="btn btn-outline-primary btn-sm d-inline-flex align-items-center gap-1 cursor-pointer">
          <i className="ti ti-camera"></i> Take Photo
          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            onChange={(e) => handleSelect(e.target.files)}
            className="d-none"
          />
        </label>
        <label className="btn btn-outline-secondary btn-sm d-inline-flex align-items-center gap-1 cursor-pointer">
          <i className="ti ti-photo"></i> Select Files
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => handleSelect(e.target.files)}
            className="d-none"
          />
        </label>
      </div>

      {error && (
        <div className="alert alert-warning py-2 px-3 small mb-3">
          <i className="ti ti-alert-triangle me-1"></i> {error}
        </div>
      )}

      {/* Thumbnails Grid */}
      <div className="row g-2">
        {photos.map((url, i) => (
          <div className="col-4 col-sm-3 col-md-2" key={url}>
            <div className="position-relative border rounded p-1 bg-white">
              <img
                src={url}
                alt=""
                className="w-100 rounded"
                style={{ height: 90, objectFit: "cover" }}
              />
              <button
                type="button"
                className="btn btn-danger btn-xs position-absolute top-0 end-0 m-1 rounded-circle p-0 d-flex align-items-center justify-content-center"
                style={{ width: 22, height: 22 }}
                onClick={() => removePhoto(i)}
                title="Remove photo"
              >
                <i className="ti ti-x fs-7"></i>
              </button>
            </div>
          </div>
        ))}

        {Array.from({ length: uploadingCount }).map((_, i) => (
          <div className="col-4 col-sm-3 col-md-2" key={`uploading-${i}`}>
            <div
              className="border rounded p-2 bg-light text-center d-flex flex-column align-items-center justify-content-center text-muted"
              style={{ height: 90 }}
            >
              <div className="spinner-border spinner-border-sm text-primary mb-1" role="status"></div>
              <span className="fs-7">Uploading…</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
