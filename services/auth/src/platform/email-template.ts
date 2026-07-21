/** Client-safe HTML email primitives (inline styles, no external assets). The
 *  product composes its own emails from these; the copy stays in the product. */

/** A minimal branded HTML shell around `bodyHtml`. `brand` is just a label
 *  (e.g. the product/tenant name) — no domain assumptions. */
export function htmlShell(brand: string, heading: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f6f7f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:480px;margin:0 auto;padding:32px 24px">
    <p style="font-size:13px;letter-spacing:.04em;text-transform:uppercase;color:#6b7280;margin:0 0 24px">${brand}</p>
    <h1 style="font-size:20px;color:#111827;margin:0 0 16px">${heading}</h1>
    ${bodyHtml}
  </div></body></html>`
}

/** A primary call-to-action button. */
export function button(href: string, label: string): string {
  return `<p style="margin:0 0 20px"><a href="${href}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:14px">${label}</a></p>`
}

/** A muted paragraph. */
export function paragraph(text: string): string {
  return `<p style="font-size:14px;color:#374151;margin:0 0 20px">${text}</p>`
}
