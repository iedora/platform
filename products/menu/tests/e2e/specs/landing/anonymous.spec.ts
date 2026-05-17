import { expect, test } from '../../fixtures'

/**
 * Anonymous landing page. Covers:
 *   - basic copy + nav CTAs
 *   - the editor ↔ phone mock bidirectional highlight sync
 *   - the idle auto-cycle behaviour (a 6s timeout starts a 4s interval)
 *   - user click freezes the auto-cycle
 *
 * Selector notes (see src/app/_components/landing/landing-page.tsx):
 *   - PHONE: <button class="menu-item [highlight]"> inside `.phone`.
 *   - EDITOR: <li class="[active]"><button class="editor-row-btn"/></li>
 *     inside `.editor .editor-side`. The "highlight" indicator on the
 *     editor side is the <li>'s `active` class.
 *
 * The auto-cycle is GATED on prefers-reduced-motion. The default fixture
 * sets `reducedMotion: 'reduce'`; we override per-test below.
 */

test.use({ storageState: { cookies: [], origins: [] } })

test.describe('Landing page (anonymous)', () => {
  test('renders title, nav CTAs, and demo mocks', async ({ page, context }) => {
    await context.clearCookies()
    await page.emulateMedia({ reducedMotion: 'no-preference' })

    await page.goto('/')

    await expect(page).toHaveTitle(/Menu — an iedora product/)
    // Nav CTAs — three load-bearing links.
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'Get started' }).first(),
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'Try it with your menu' }),
    ).toBeVisible()

    // Editor + phone mocks both render their lists.
    await expect(page.locator('.editor .editor-row-btn').first()).toBeVisible()
    await expect(page.locator('.phone .menu-item').first()).toBeVisible()
  })

  test('clicking an editor row updates the phone highlight', async ({
    page,
    context,
  }) => {
    await context.clearCookies()
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto('/')

    const editorRows = page.locator('.editor .editor-row-btn')
    const phoneItems = page.locator('.phone .menu-item')
    await expect(editorRows.first()).toBeVisible()
    await expect(phoneItems.first()).toBeVisible()

    // Pick a row not currently highlighted by clicking the LAST one.
    const lastBtn = editorRows.last()
    const targetText = (await lastBtn.textContent())?.trim() ?? ''
    expect(targetText.length).toBeGreaterThan(0)
    await lastBtn.click()

    // The corresponding phone item picks up `.highlight` (same element).
    await expect(page.locator('.phone .menu-item.highlight')).toHaveCount(1)
    // Suppress unused-variable lint.
    expect(phoneItems).toBeDefined()
  })

  test('clicking a phone item highlights the editor — mirror direction', async ({
    page,
    context,
  }) => {
    await context.clearCookies()
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto('/')

    const phoneItems = page.locator('.phone .menu-item')
    await expect(phoneItems.first()).toBeVisible()

    await phoneItems.nth(1).click()
    // The editor's "active" indicator is the <li>'s active class.
    await expect(page.locator('.editor .editor-side li.active')).toHaveCount(1)
    await expect(page.locator('.phone .menu-item.highlight')).toHaveCount(1)
  })

  test('idle auto-cycle shifts the phone highlight on its own', async ({
    page,
    context,
  }) => {
    await context.clearCookies()
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto('/')

    const highlightedPhone = () => page.locator('.phone .menu-item.highlight')
    await expect(highlightedPhone()).toHaveCount(1)
    const firstText = (await highlightedPhone().textContent()) ?? ''
    expect(firstText.length).toBeGreaterThan(0)

    // Auto-cycle: 6s timeout → 4s interval. Wait up to 12s for the first
    // shift.
    await expect
      .poll(async () => (await highlightedPhone().textContent()) ?? '', {
        timeout: 12_000,
        intervals: [500, 500, 1000],
      })
      .not.toBe(firstText)
  })

  test('one click freezes the auto-cycle (no shift over 7s)', async ({
    page,
    context,
  }) => {
    await context.clearCookies()
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto('/')

    const highlightedPhone = () => page.locator('.phone .menu-item.highlight')
    await expect(highlightedPhone()).toHaveCount(1)

    // Click any phone item to set userInteracted = true.
    await page.locator('.phone .menu-item').first().click()
    const afterClickText = (await highlightedPhone().textContent()) ?? ''

    // Sample every 500ms over 7s. None of the snapshots should differ.
    const samples: string[] = []
    const start = Date.now()
    while (Date.now() - start < 7000) {
      samples.push((await highlightedPhone().textContent()) ?? '')
      await page.evaluate(
        () => new Promise<void>((r) => setTimeout(r, 500)),
      )
    }
    for (const s of samples) expect(s).toBe(afterClickText)
  })
})
