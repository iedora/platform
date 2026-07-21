import { expect, test } from '@playwright/test'

const IPHONE_4 = { width: 320, height: 480 }

/** True when the document scrolls horizontally (content wider than the viewport). */
async function hasHorizontalOverflow(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const de = document.documentElement
    return de.scrollWidth > de.clientWidth + 1
  })
}

test.describe('house landing', () => {
  test('renders the hero and the section scaffolds', async ({ page }) => {
    await page.goto('/house')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByTestId('house-services')).toBeVisible()
    await expect(page.getByTestId('house-cta')).toBeVisible()
    await expect(page.getByTestId('house-founder')).toBeVisible()
  })

  test('has no horizontal overflow on a 320px iPhone 4', async ({ page }) => {
    await page.setViewportSize(IPHONE_4)
    await page.goto('/house')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    expect(await hasHorizontalOverflow(page)).toBe(false)
  })
})

test.describe('menu landing', () => {
  test('the language chips live-translate the preview card', async ({ page }) => {
    await page.goto('/menu')
    const card = page.getByTestId('menu-preview-card')
    await expect(card).toBeVisible()

    await page.getByTestId('menu-preview-lang-PT').click()
    await expect(card).toContainText('Digitalize para ver')

    await page.getByTestId('menu-preview-lang-FR').click()
    await expect(card).toContainText('Scannez pour voir')
  })

  test('pricing shows two plans and no overflow at 320px', async ({ page }) => {
    await page.setViewportSize(IPHONE_4)
    await page.goto('/menu')
    await expect(page.getByTestId('menu-pricing').locator('[data-slot=card]')).toHaveCount(2)
    expect(await hasHorizontalOverflow(page)).toBe(false)
  })

  test('the brand links row never half-wraps', async ({ page }) => {
    await page.setViewportSize(IPHONE_4)
    await page.goto('/menu')
    // The Fork + Google Maps must each sit on their own line (3 distinct tops:
    // label, fork, maps) — never the orphaned "Google Maps" wrap.
    const tops = await page
      .getByTestId('menu-hero')
      .locator('xpath=.//div[contains(@class,"mt-6")][1]/*')
      .evaluateAll((els) => new Set(els.map((e) => Math.round(e.getBoundingClientRect().top))).size)
    expect(tops).toBe(3)
  })
})
