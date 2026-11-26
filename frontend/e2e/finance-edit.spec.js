import { expect, test } from '@playwright/test'

function required(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Set ${name} in frontend/.env.e2e before running E2E tests.`)
  }
  return value
}

async function login(page) {
  await page.goto('/')

  const role = (process.env.E2E_ROLE || 'client').toLowerCase()

  if (role === 'client') {
    await page.locator('.client-login-link').click()
  } else if (role === 'admin' || role === 'agent') {
    await page
      .getByRole('button', { name: new RegExp(`^${role}$`, 'i') })
      .click()
  } else {
    throw new Error(`Unsupported E2E_ROLE: ${role}`)
  }

  await page.locator('#login-email').fill(required('E2E_EMAIL'))
  await page.locator('#login-password').fill(required('E2E_PASSWORD'))
  await page.locator('button[type="submit"]').click()

  await expect(page.locator('#login-email')).toHaveCount(0, {
    timeout: 30_000
  })
}

async function openListEdit(page, route, recordId) {
  await page.goto(route)

  await expect(page.locator('table.loan-list-table')).toBeVisible()

  const row = recordId
    ? page.locator('tbody tr', { hasText: recordId })
    : page.locator('tbody tr').first()

  await expect(row).toBeVisible()
  await row.getByRole('button', { name: 'Edit' }).click()

  await expect(page.locator('form')).toBeVisible()
}

async function expectNoSaveError(page) {
  await expect(page.locator('form')).toHaveCount(0)
  await expect(
    page.getByText(
      /Unable to save|schedule generation failed|Payment status could not be checked/i
    )
  ).toHaveCount(0)
}

test.describe('finance list edit', () => {
  test('weekly edit opens from the list', async ({ page }) => {
    await login(page)
    await openListEdit(page, '/weekly', process.env.E2E_WEEKLY_ID)

    await expect(page.getByLabel('Already Paid')).toBeVisible()
    await expect(
      page.getByText(/Payment status could not be checked/i)
    ).toHaveCount(0)
  })

  test('monthly edit opens from the list', async ({ page }) => {
    await login(page)
    await openListEdit(page, '/monthly', process.env.E2E_MONTHLY_ID)

    await expect(page.getByLabel('Already Paid')).toBeVisible()
    await expect(
      page.getByText(/Payment status could not be checked/i)
    ).toHaveCount(0)
  })

  test('weekly edit saves without a payment or schedule error', async ({
    page
  }) => {
    const recordId = process.env.E2E_WEEKLY_ID
    test.skip(
      process.env.E2E_ALLOW_SAVE !== '1',
      'Set E2E_ALLOW_SAVE=1 to run write tests.'
    )

    await login(page)
    await openListEdit(page, '/weekly', recordId)

    await page
      .getByRole('button', { name: /Save Weekly Finance/i })
      .click()

    await expectNoSaveError(page)
  })

  test('monthly edit saves without a payment or schedule error', async ({
    page
  }) => {
    const recordId = process.env.E2E_MONTHLY_ID
    test.skip(
      process.env.E2E_ALLOW_SAVE !== '1',
      'Set E2E_ALLOW_SAVE=1 to run write tests.'
    )

    await login(page)
    await openListEdit(page, '/monthly', recordId)

    await page
      .getByRole('button', { name: /Save Monthly Finance/i })
      .click()

    await expectNoSaveError(page)
  })
})
