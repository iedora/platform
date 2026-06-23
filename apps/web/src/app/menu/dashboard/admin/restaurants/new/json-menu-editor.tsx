'use client'

import CodeMirror from '@uiw/react-codemirror'
import { json, jsonParseLinter } from '@codemirror/lang-json'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { linter, lintGutter } from '@codemirror/lint'
import { EditorView } from '@codemirror/view'
import { tags } from '@lezer/highlight'
import { WarningCircleIcon, CheckCircleIcon } from '@phosphor-icons/react'
import type { JsonValidation } from './validate-menu-json'

// On-brand JSON syntax colours (matches the Pencil code block): teal keys,
// cinnabar strings, violet numbers/booleans, muted punctuation.
const jsonHighlight = HighlightStyle.define([
  { tag: tags.propertyName, color: '#0E7490' },
  { tag: tags.string, color: 'var(--primary)' },
  { tag: [tags.number, tags.bool, tags.null], color: '#7C3AED' },
  { tag: [tags.brace, tags.bracket, tags.punctuation, tags.separator], color: 'var(--muted-foreground)' },
])

// Warm-light editor chrome: transparent so the card's paper-2 surface shows
// through, mono body, restrained gutters, cinnabar selection + active line.
const warmTheme = EditorView.theme({
  '&': { backgroundColor: 'transparent', fontSize: '12.5px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-content': { fontFamily: 'var(--font-mono, ui-monospace, monospace)', padding: '10px 0' },
  '.cm-gutters': { backgroundColor: 'transparent', border: 'none', color: 'var(--muted-foreground)' },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--primary) 6%, transparent)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: 'color-mix(in srgb, var(--primary) 20%, transparent) !important',
  },
  '.cm-lint-marker': { width: '12px', height: '12px' },
})

/**
 * JSON menu editor: CodeMirror with JSON syntax highlighting and inline syntax
 * linting (red gutter markers + underlines on parse errors), plus an IDE-style
 * "Problems" panel below that lists schema validation issues (path + message)
 * computed by the parent. Loaded client-only (CodeMirror needs the DOM).
 */
export function JsonMenuEditor({
  value,
  onChange,
  validation,
  problemsTitle,
  validLabel,
}: {
  value: string
  onChange: (value: string) => void
  validation: JsonValidation
  problemsTitle: string
  validLabel: string
}) {
  const problems = validation.state === 'syntax' || validation.state === 'invalid' ? validation.problems : []

  return (
    <div className="space-y-3" data-test-id="json-menu-editor">
      <div className="overflow-hidden rounded-[12px] border border-border bg-muted focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
        <CodeMirror
          value={value}
          onChange={onChange}
          height="300px"
          theme={warmTheme}
          extensions={[
            json(),
            syntaxHighlighting(jsonHighlight),
            linter(jsonParseLinter()),
            lintGutter(),
            EditorView.lineWrapping,
          ]}
          basicSetup={{
            lineNumbers: true,
            foldGutter: false,
            highlightActiveLine: true,
            autocompletion: false,
            highlightSelectionMatches: false,
          }}
        />
      </div>

      {validation.state === 'valid' ? (
        <p
          className="flex items-center gap-1.5 text-[12.5px] font-medium text-green-600"
          data-test-id="json-menu-valid"
        >
          <CheckCircleIcon size={14} weight="bold" /> {validLabel}
        </p>
      ) : problems.length ? (
        <div
          className="rounded-[10px] border border-[#F4C7C0] bg-[#FDF1EE] p-3"
          role="alert"
          data-test-id="json-menu-problems"
        >
          <p className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-[#D92D20]">
            <WarningCircleIcon size={13} weight="bold" /> {problemsTitle} · {problems.length}
          </p>
          <ul className="space-y-1">
            {problems.slice(0, 12).map((p, i) => (
              <li key={`${p.path}-${i}`} className="flex gap-2 text-[12.5px] leading-snug text-foreground">
                {p.path ? (
                  <code className="shrink-0 rounded bg-muted px-1.5 font-mono text-[11.5px] text-primary">
                    {p.path}
                  </code>
                ) : null}
                <span className="text-muted-foreground">{p.message}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
