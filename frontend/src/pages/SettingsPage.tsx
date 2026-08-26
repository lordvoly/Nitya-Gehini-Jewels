import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { fetchShopSettings, updateShopSettings, type ShopSettings } from "../lib/shopSettings";
import { toIntOrNull } from "../lib/numbers";
import { useSlowLoadHint } from "../lib/useSlowLoadHint";
import { FormSkeleton } from "../components/common/Skeleton";
import "../styles/shared.css";

export default function SettingsPage() {
  const { profile } = useAuth();
  const [settings, setSettings] = useState<ShopSettings | null>(null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [occasionDiscountPercent, setOccasionDiscountPercent] = useState("10");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchShopSettings()
      .then((s) => {
        setSettings(s);
        setName(s.name);
        setAddress(s.address);
        setPhone(s.phone);
        setOccasionDiscountPercent(String(s.occasion_discount_percent));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load shop settings"))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const updated = await updateShopSettings({
        name,
        address,
        phone,
        occasion_discount_percent: toIntOrNull(occasionDiscountPercent) ?? 10,
      });
      setSettings(updated);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save shop settings");
    } finally {
      setSaving(false);
    }
  }

  const showSlowHint = useSlowLoadHint(loading);

  // profile is null both while it's still loading and if the /api/me call
  // ever fails — only gate once we know for sure it resolved to a non-admin,
  // so a slow profile fetch doesn't flash "Admins only" at a real admin.
  if (profile && profile.role !== "admin") {
    return (
      <div className="page">
        <h2>Settings</h2>
        <div className="empty-state">
          <h3>Admins only</h3>
          <p>This screen is restricted to admin accounts.</p>
        </div>
      </div>
    );
  }

  if (loading)
    return (
      <>
        <FormSkeleton />
        {showSlowHint && (
          <p className="wizard-hint slow-load-hint">
            Still loading. The server may be waking up after a period of inactivity, which can take up to a minute.
          </p>
        )}
      </>
    );

  const incomplete = settings && (!settings.address || !settings.phone);

  return (
    <div className="page">
      <h2>Shop Settings</h2>
      <p className="wizard-hint">Shown on printed receipts — name, address, and phone.</p>

      {incomplete && !saved && (
        <div className="found-panel">
          <p>
            <strong>Address and/or phone aren't filled in yet.</strong> Fill these in before printing real receipts
            for customers.
          </p>
        </div>
      )}

      {error && <p className="wizard-error">{error}</p>}
      {saved && <p className="wizard-hint">Saved.</p>}

      <label className="field-label">
        Shop Name
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field-label">
        Address
        <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Not set" />
      </label>
      <label className="field-label">
        Phone
        <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Not set" />
      </label>
      <label className="field-label">
        Occasion Discount (%)
        <input
          type="number"
          min={0}
          value={occasionDiscountPercent}
          onChange={(e) => setOccasionDiscountPercent(e.target.value)}
        />
      </label>
      <p className="wizard-hint">
        The discount % offered in the birthday/anniversary WhatsApp greeting sent from the Dashboard's Upcoming
        Occasions section.
      </p>

      <div className="wizard-actions">
        <button className="btn-primary btn-save" disabled={saving || !name.trim()} onClick={handleSave}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
