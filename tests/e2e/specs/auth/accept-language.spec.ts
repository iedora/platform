import { expect, test } from '@playwright/test'

// Failing-first: anonymous visitors carry no NEXT_LOCALE cookie. Today the
// dashboard locale falls back to English regardless of the browser's
// Accept-Language header — fine for the dashboard, but means a Portuguese
// visitor lands on /signup reading English. This spec asserts that:
//
//   1. With Accept-Language: pt, the signup page heading is in PT.
//   2. The cookie still wins when present (set NEXT_LOCALE=en, header says
//      pt → English wins).
//
// Failing now means: (a) signup-form.tsx has hardcoded English, AND/OR
// (b) i18n/request.ts only checks the cookie, never the header.
test.describe('Accept-Language fallback for anonymous auth pages', () => {
  // Force a clean storage state so no admin cookies leak the locale.
  test.use({ storageState: { cookies: [], origins: [] } })

  test('signup heading is rendered in PT for Accept-Language: pt', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      locale: 'pt-PT',
      extraHTTPHeaders: { 'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.5' },
    })
    const page = await ctx.newPage()
    await page.goto('/signup')

    // Catalog key Auth.signupTitle = "Criar a tua conta no Meta Menu" in PT.
    await expect(
      page.getByText('Criar a tua conta no Meta Menu'),
    ).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt')

    await ctx.close()
  })

  test('explicit cookie locale overrides Accept-Language', async ({ browser }) => {
    const ctx = await browser.newContext({
      locale: 'pt-PT',
      extraHTTPHeaders: { 'Accept-Language': 'pt-PT,pt;q=0.9' },
    })
    // Pin English via the cookie that setUserLocale would set in real flow.
    await ctx.addCookies([
      {
        name: 'NEXT_LOCALE',
        value: 'en',
        url: 'http://localhost:3000',
      },
    ])
    const page = await ctx.newPage()
    await page.goto('/signup')

    await expect(
      page.getByText('Create your Meta Menu account'),
    ).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')

    await ctx.close()
  })
})
