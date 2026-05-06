import { expect, test } from '@playwright/test'
import { apiSignup, uniqueUser } from '../../helpers/auth'

// Failing-first: a Portuguese visitor signs up and lands on /onboarding.
// Without translation, they read English: "Create your first restaurant".
// With Auth + Onboarding translated and Accept-Language negotiation in place,
// the same visitor sees the PT heading and submit button.
test.describe('Onboarding form (UI locale)', () => {
  test('PT visitor sees translated heading and submit button on /onboarding', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      locale: 'pt-PT',
      extraHTTPHeaders: { 'Accept-Language': 'pt-PT,pt;q=0.9' },
    })
    const page = await ctx.newPage()

    // Sign up via the form so the session cookie + locale cookie come from
    // the actual production code path.
    await apiSignup(page.request, uniqueUser('onboarding-pt'))
    await page.goto('/onboarding')

    await expect(page.locator('html')).toHaveAttribute('lang', 'pt')
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'Cria o teu primeiro restaurante',
      }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Criar restaurante' }),
    ).toBeVisible()

    await ctx.close()
  })
})
