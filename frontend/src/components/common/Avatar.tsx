// First + last initials for a multi-word name ("Aryan Batheja" -> "AB");
// first two letters of a single-word name; "?" for an empty/missing name.
function getInitials(name: string | undefined | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Same circular wine/ivory treatment whether it's showing a photo or
// initials, so an avatar never visually "changes shape" the moment someone
// uploads their first photo.
export function Avatar({ name, photoUrl, size = 36 }: { name: string | undefined | null; photoUrl?: string | null; size?: number }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.4) };
  if (photoUrl) {
    return (
      <span className="avatar" style={style}>
        <img src={photoUrl} alt="" className="avatar-photo" />
      </span>
    );
  }
  return (
    <span className="avatar avatar-initials" style={style}>
      {getInitials(name)}
    </span>
  );
}
