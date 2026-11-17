/**
 * A listing's authenticity check as a small shield: filled when the shop or the platform checks the
 * item before it ships, outlined when a check costs extra, and nothing when nobody checks or the
 * shop doesn't say. In a filter's options (lead), a blank of the same width keeps the names in line.
 */
export function Shield({ auth, note, lead }: { auth: string; note?: string; lead?: boolean }) {
  const cls = `shield${lead ? " lead" : ""}`;
  if (auth !== "shop" && auth !== "listing" && auth !== "optional") return lead ? <span className={`${cls} blank`} aria-hidden="true" /> : null;
  return (
    <span className={`${cls}${auth === "optional" ? " open" : ""}`} title={note || undefined} role={note ? "img" : undefined} aria-label={note || undefined} aria-hidden={note ? undefined : true}>
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path className="body" d="M8 1.2 2.6 3.3v4.1c0 3.4 2.3 6.1 5.4 7.4 3.1-1.3 5.4-4 5.4-7.4V3.3Z" />
        {auth === "optional" ? null : <path className="tick" d="m5.4 8.1 1.9 1.9 3.4-3.6" />}
      </svg>
    </span>
  );
}
