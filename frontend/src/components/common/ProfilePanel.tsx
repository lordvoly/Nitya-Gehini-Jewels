import { useState } from "react";
import { useAuth } from "../../lib/auth";
import { updateMe, uploadProfilePhoto } from "../../lib/me";
import { supabase } from "../../lib/supabase";
import { PhotoPicker } from "../items/PhotoPicker";
import { Avatar } from "./Avatar";

const ROLE_LABELS: Record<string, string> = { admin: "Admin", operator: "Operator" };

// Self-service only — own account, no way to view or edit anyone else's
// profile. There's no :id in any of this panel's requests; every call is
// scoped server-side to whichever token made it (see routes/me.ts).
export function ProfilePanel({ onClose }: { onClose: () => void }) {
  const { profile, refreshProfile } = useAuth();

  const [name, setName] = useState(profile?.name ?? "");
  const [nameSaving, setNameSaving] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const [photoError, setPhotoError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);

  if (!profile) return null;

  async function handleSaveName() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setNameError(null);
    setNameSaved(false);
    setNameSaving(true);
    try {
      await updateMe({ name: trimmed });
      await refreshProfile();
      setNameSaved(true);
    } catch (e) {
      setNameError(e instanceof Error ? e.message : "Failed to save name");
    } finally {
      setNameSaving(false);
    }
  }

  // PhotoPicker is built for a multi-photo array; a profile has exactly one,
  // so this always feeds it back a 0-or-1-length array regardless of what
  // it reports, giving a "replace photo" experience without changing the
  // component itself.
  async function handlePhotoChange(photos: string[]) {
    setPhotoError(null);
    try {
      if (photos.length === 0) {
        // The picker's own "remove" button — no upload involved, so this is
        // the only path that needs an explicit PATCH to clear photo_url.
        await updateMe({ photo_url: null });
      }
      await refreshProfile();
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : "Failed to update photo");
    }
  }

  async function handleChangePassword() {
    setPasswordError(null);
    setPasswordSaved(false);
    if (newPassword.length < 6) {
      setPasswordError("New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New password and confirmation don't match.");
      return;
    }
    setPasswordSaving(true);
    try {
      // Confirm the current password first — updateUser() alone would
      // happily change the password using only the existing session, with
      // no proof the person at the keyboard actually knows the old one.
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email: profile!.email,
        password: currentPassword,
      });
      if (reauthError) {
        setPasswordError("Current password is incorrect.");
        return;
      }
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) {
        setPasswordError(updateError.message);
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSaved(true);
    } catch (e) {
      setPasswordError(e instanceof Error ? e.message : "Failed to change password");
    } finally {
      setPasswordSaving(false);
    }
  }

  return (
    <div className="profile-panel">
      <div className="profile-panel-header">
        <Avatar name={profile.name} photoUrl={profile.photo_url} size={64} />
        <div>
          <h3 className="profile-panel-name">{profile.name}</h3>
          <p className="wizard-hint">{profile.email}</p>
        </div>
      </div>

      <label className="field-label">
        Display Name
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      {nameError && <p className="wizard-error">{nameError}</p>}
      {nameSaved && <p className="wizard-hint">Saved.</p>}
      <div className="wizard-actions">
        <button type="button" className="btn-secondary" disabled={nameSaving || !name.trim()} onClick={handleSaveName}>
          {nameSaving ? "Saving…" : "Save Name"}
        </button>
      </div>

      <p className="field-label">
        Role
        <input type="text" value={ROLE_LABELS[profile.role] ?? profile.role} disabled readOnly />
      </p>
      <p className="wizard-hint">Role changes are admin-only and aren't editable here.</p>

      <p className="field-label">Profile Photo</p>
      {photoError && <p className="wizard-error">{photoError}</p>}
      <PhotoPicker
        photos={profile.photo_url ? [profile.photo_url] : []}
        onChange={handlePhotoChange}
        hint="Uploads and saves immediately."
        uploadFn={uploadPhotoAndReturnUrl}
      />

      <div className="danger-zone">
        <p className="field-label">Change Password</p>
        <p className="wizard-hint">Confirm your current password first.</p>
        <label className="field-label">
          Current Password
          <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" />
        </label>
        <label className="field-label">
          New Password
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
        </label>
        <label className="field-label">
          Confirm New Password
          <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />
        </label>
        {passwordError && <p className="wizard-error">{passwordError}</p>}
        {passwordSaved && <p className="wizard-hint">Password changed.</p>}
        <div className="wizard-actions">
          <button
            type="button"
            className="btn-secondary"
            disabled={passwordSaving || !currentPassword || !newPassword || !confirmPassword}
            onClick={handleChangePassword}
          >
            {passwordSaving ? "Changing…" : "Change Password"}
          </button>
        </div>
      </div>

      <div className="wizard-nav">
        <button type="button" className="btn-primary" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

async function uploadPhotoAndReturnUrl(file: File): Promise<string> {
  const updated = await uploadProfilePhoto(file);
  return updated.photo_url ?? "";
}
