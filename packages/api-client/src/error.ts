/** HTTP error from a service, surfaced with its status for mapping. */
export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/**
 * The service's real error message from a non-OK Response. Read the body as text
 * once, then prefer a JSON `{ error }` shape, else the raw text (Hono's
 * HTTPException returns the message as a plain-text body), falling back to the
 * status text only when there's no body at all. One canonical extractor shared
 * by `apiJson` (menu) and every auth-service call, so the two can't diverge.
 */
export async function errorMessageFromResponse(res: Response): Promise<string> {
  const text = await res.text().catch(() => '')
  if (!text) return res.statusText
  try {
    const body = JSON.parse(text) as unknown
    if (body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string') {
      return (body as { error: string }).error
    }
    return text
  } catch {
    return text
  }
}
