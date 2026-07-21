// Slug rules — 2–40 chars, lowercase
// alphanumerics and single dashes, starting and ending alphanumeric. Globally
// unique across restaurants.
const MIN_SLUG_LEN = 2;
const MAX_SLUG_LEN = 40;
const slugPattern = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/** True if s is an acceptable restaurant slug as-is. */
export function validSlug(s: string): boolean {
  return (
    s.length >= MIN_SLUG_LEN && s.length <= MAX_SLUG_LEN && slugPattern.test(s) && !s.includes("--")
  );
}

// slugify derives a slug candidate from a display name: deaccented, lowered,
// non-alphanumerics collapsed to single dashes, trimmed to the length limits.
// Returns "" when nothing usable remains (caller falls back to a generated id).
export function slugify(name: string): string {
  const flat = name.normalize("NFD").replace(/\p{Diacritic}/gu, "");
  let out = "";
  let dash = true; // suppress leading dash
  for (const r of flat.toLowerCase()) {
    if ((r >= "a" && r <= "z") || (r >= "0" && r <= "9")) {
      out += r;
      dash = false;
    } else if (!dash) {
      out += "-";
      dash = true;
    }
  }
  let s = trimDashes(out);
  if (s.length > MAX_SLUG_LEN) s = trimDashes(s.slice(0, MAX_SLUG_LEN));
  return s.length < MIN_SLUG_LEN ? "" : s;
}

// numbered returns the n-th collision candidate ("tasca", "tasca-2", …), within
// the length limit.
export function numbered(base: string, n: number): string {
  if (n <= 1) return base;
  const suffix = `-${n}`;
  if (base.length + suffix.length > MAX_SLUG_LEN) {
    base = trimDashes(base.slice(0, MAX_SLUG_LEN - suffix.length));
  }
  return base + suffix;
}

function trimDashes(s: string): string {
  return s.replace(/^-+/, "").replace(/-+$/, "");
}
