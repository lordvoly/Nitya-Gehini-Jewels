import { apiFetch } from "./api";
import type { UserProfile } from "./auth";

export interface MePatch {
  name?: string;
  // Explicitly null clears the photo — omit the field entirely to leave it
  // untouched.
  photo_url?: null;
}

export function updateMe(patch: MePatch) {
  return apiFetch<UserProfile>("/api/me", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

// Uploads and records the photo against the caller's own row in one step —
// unlike item photos, there's no separate surrounding form/Save step for a
// standalone avatar control to wait for.
export function uploadProfilePhoto(file: File) {
  const form = new FormData();
  form.append("photo", file);
  return apiFetch<UserProfile>("/api/me/photo", {
    method: "POST",
    body: form,
  });
}
