import { importPayload } from '@iedora/contracts'

// Client-side validation of the pasted import JSON, kept free of any CodeMirror
// imports so the form can call it during SSR/hydration and to gate the submit.
// It runs the SAME `importPayload` schema the menu service validates against, so
// what shows green here is what the server will accept (the server still owns
// tenant + language + plan checks beyond the document's shape).

export type JsonProblem = { path: string; message: string }

export type JsonValidation =
  | { state: 'empty' }
  | { state: 'syntax'; problems: JsonProblem[] } // not parseable as JSON
  | { state: 'invalid'; problems: JsonProblem[] } // parses, but fails the schema
  | { state: 'valid' }

export function validateMenuJson(text: string): JsonValidation {
  if (!text.trim()) return { state: 'empty' }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    return { state: 'syntax', problems: [{ path: '', message: (err as Error).message }] }
  }

  const result = importPayload.safeParse(parsed)
  if (result.success) return { state: 'valid' }

  return {
    state: 'invalid',
    problems: result.error.issues.map((issue) => ({
      path: issue.path.length ? issue.path.join('.') : '(root)',
      message: issue.message,
    })),
  }
}

export const isImportable = (v: JsonValidation): boolean => v.state === 'valid'
