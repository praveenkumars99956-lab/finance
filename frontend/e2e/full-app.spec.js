import { expect, test } from '@playwright/test'

const adminRoutes = [
  '/admin',
  '/loans',
  '/customers',
  '/collections',
  '/payments',
  '/pending',
  '/reports',
  '/reports/collections',
  '/audit-logs',
  '/settings',
  '/categories',
  '/agents',
  '/assignments',
  '/settlements',
  '/daily',
  '/weekly',
  '/monthly',
  '/interest-only',
  '/daily/manage',
  '/weekly/manage',
  '/monthly/manage',
  '/interest-only/manage'
]

const publicRoutes = [
  '/',
  '/admin/create',
  '/forgot-password',
  '/reset-password'
]

const agentRoutes = [
  '/agent',
  '/agent/today',
  '/agent/pending',
  '/agent/customers',
  '/agent/history',
  '/agent/settlement',
  '/agent/profile',
  '/agent/loans/daily',
  '/agent/loans/weekly',
  '/agent/loans/monthly',
  '/agent/loans/interest_only'
]

function required(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Set ${name} in frontend/.env.e2e for this test.`)
  }
  return value
}

async function loginAs(page, role) {
  await page.goto('/')

  await page
    .getByRole('button', { name: new RegExp(`^${role}$`, 'i') })
    .click()

  const emailKey = role === 'admin' ? 'E2E_EMAIL' : 'E2E_AGENT_EMAIL'
  const passwordKey = role === 'admin' ? 'E2E_PASSWORD' : 'E2E_AGENT_PASSWORD'

  await page.locator('#login-email').fill(required(emailKey))
  await page.locator('#login-password').fill(required(passwordKey))
  await page.locator('form button[type="submit"]').click()

  await expect(page.locator('#login-email')).toHaveCount(0, {
    timeout: 45_000
  })
}

async function clearToasts(page) {
  const closes = page.locator('.toast-close')
  const count = await closes.count()
  for (let i = 0; i < count; i += 1) {
    await closes.first().click().catch(() => {})
  }
}

async function assertNoHorizontalOverflow(page, label) {
  const overflow = await page.evaluate(() =>
    Math.max(
      0,
      document.documentElement.scrollWidth -
        document.documentElement.clientWidth
    )
  )
  expect(
    overflow,
    `${label} has ${overflow}px of horizontal page overflow`
  ).toBeLessThanOrEqual(2)
}

async function assertRoute(page, path, options = {}) {
  const { shell, allowNotFound = false, allowedPaths } = options

  await clearToasts(page)
  await page.goto(path, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(750)

  const expectedPaths = allowedPaths || [path]
  await expect(page).toHaveURL((url) => expectedPaths.includes(url.pathname))

  await expect(page.locator('#root')).toBeVisible()
  await expect(page.locator('.route-loading')).toHaveCount(0, {
    timeout: 15_000
  })
  await expect(page.locator('body')).not.toContainText(
    'Checking your login',
    { timeout: 15_000 }
  )
  await expect(page.locator('body')).not.toContainText(
    'This check will stop after 15 seconds',
    { timeout: 15_000 }
  )

  if (shell === 'admin') {
    await expect(page.locator('#admin-sidebar')).toHaveCount(1)
    await expect(page.locator('main.admin-content')).toHaveCount(1)
  }

  if (shell === 'agent') {
    await expect(page.locator('#agent-sidebar')).toHaveCount(1)
    await expect(page.locator('main.agent-main')).toHaveCount(1)
  }

  const bodyText = await page.locator('body').innerText()
  expect(bodyText, `${path} stuck on auth check`).not.toMatch(
    /Checking your login/i
  )
  if (!allowNotFound) {
    expect(bodyText, `${path} showed a load/save error`).not.toMatch(
      /Unable to (load|save|check)|Something went wrong|Internal Server Error/i
    )
    expect(bodyText, `${path} showed a not-found state`).not.toMatch(
      /\bFinance not found\b/i
    )
  }

  await expect(page.locator('.toast--error')).toHaveCount(0)
  await assertNoHorizontalOverflow(page, path)
}

async function discoverCustomerId(page) {
  await clearToasts(page)
  await page.goto('/customers')
  await page.waitForTimeout(3000)

  const viewButton = page.getByRole('button', { name: /view profile/i }).first()
  if ((await viewButton.count()) === 0) return null

  try {
    await Promise.all([
      page.waitForURL((url) => /^\/customers\/\d+$/.test(url.pathname), {
        timeout: 15_000
      }),
      viewButton.click()
    ])
  } catch {
    return null
  }

  const match = page.url().match(/\/customers\/(\d+)/)
  return match ? match[1] : null
}

function normalizeFinanceType(value) {
  const text = String(value || '').toLowerCase()
  if (text.includes('interest')) return 'interest-only'
  if (text.includes('daily')) return 'daily'
  if (text.includes('weekly')) return 'weekly'
  if (text.includes('monthly')) return 'monthly'
  return null
}

async function discoverFinanceIds(page) {
  const ids = {}

  const captureRows = async (response) => {
    if (
      response.request().method() !== 'GET' ||
      !response.url().includes('/rest/v1/finance_records')
    ) {
      return
    }

    try {
      const rows = await response.json()
      for (const row of Array.isArray(rows) ? rows : []) {
        const type = normalizeFinanceType(
          row.finance_type || row.category_type
        )
        if (type && row.id && !ids[type]) ids[type] = String(row.id)
      }
    } catch {
      // Ignore non-JSON or already-consumed responses.
    }
  }

  page.on('response', captureRows)

  for (const route of [
    '/daily',
    '/weekly',
    '/monthly',
    '/interest-only'
  ]) {
    await clearToasts(page)
    await page.goto(route)
    await page.waitForTimeout(3000)
  }

  page.off('response', captureRows)
  return ids
}

async function discoverAgentCollectionId(page) {
  let foundId = null

  const captureRows = async (response) => {
    if (
      response.request().method() !== 'GET' ||
      !response.url().includes('/rest/v1/')
    ) {
      return
    }

    try {
      const rows = await response.json()
      for (const row of Array.isArray(rows) ? rows : []) {
        const id = row?.id || row?.finance_id || row?.finance_record_id
        if (
          id &&
          (row.finance_type ||
            row.principal_amount ||
            row.finance_record_id)
        ) {
          foundId = String(id)
          return
        }
      }
    } catch {
      // Ignore non-JSON or already-consumed responses.
    }
  }

  page.on('response', captureRows)

  for (const route of [
    '/agent',
    '/agent/today',
    '/agent/pending',
    '/agent/loans/daily',
    '/agent/loans/weekly',
    '/agent/loans/monthly'
  ]) {
    await clearToasts(page)
    await page.goto(route)
    await page.waitForTimeout(5000)
    if (foundId) break
  }

  page.off('response', captureRows)
  if (foundId) return foundId

  await clearToasts(page)
  await page.goto('/agent/today')
  await page.waitForTimeout(5000)

  const collectButton = page.locator('.record-payment-button').first()
  if ((await collectButton.count()) === 0) return null

  try {
    await Promise.all([
      page.waitForURL(
        (url) => /^\/agent\/collection\/\d+$/.test(url.pathname),
        { timeout: 15_000 }
      ),
      collectButton.click()
    ])
  } catch {
    return null
  }

  const match = page.url().match(/\/agent\/collection\/(\d+)/)
  return match ? match[1] : null
}

test.describe('full app sweep - public', () => {
  let context
  let page
  const pageErrors = []

  test.beforeAll(async ({ browser }, testInfo) => {
    context = await browser.newContext({
      baseURL: testInfo.project.use.baseURL,
      viewport: testInfo.project.use.viewport,
      deviceScaleFactor: testInfo.project.use.deviceScaleFactor,
      isMobile: testInfo.project.use.isMobile,
      hasTouch: testInfo.project.use.hasTouch
    })
    page = await context.newPage()
    page.on('pageerror', (error) => pageErrors.push(error.message))
  })

  test.afterAll(async () => {
    if (context) await context.close()
  })

  for (const route of publicRoutes) {
    test(`public page ${route}`, async () => {
      const allowedPaths =
        route === '/'
          ? ['/', '/admin', '/agent']
          : [route]

      await assertRoute(page, route, { allowedPaths })
    })
  }

  test('no uncaught page errors on public pages', async () => {
    expect(pageErrors).toEqual([])
  })
})

test.describe('full app sweep - admin', () => {
  let context
  let page
  let customerId = null
  let financeIds = {}
  const pageErrors = []

  test.beforeAll(async ({ browser }, testInfo) => {
    context = await browser.newContext({
      baseURL: testInfo.project.use.baseURL,
      viewport: testInfo.project.use.viewport,
      deviceScaleFactor: testInfo.project.use.deviceScaleFactor,
      isMobile: testInfo.project.use.isMobile,
      hasTouch: testInfo.project.use.hasTouch
    })
    page = await context.newPage()
    page.on('pageerror', (error) => pageErrors.push(error.message))

    await loginAs(page, 'admin')
    customerId = await discoverCustomerId(page)
    financeIds = await discoverFinanceIds(page)
  })

  test.afterAll(async () => {
    if (context) await context.close()
  })

  for (const route of adminRoutes) {
    const allowNotFound = route.endsWith('/manage')
    test(`admin page ${route}`, async () => {
      await assertRoute(page, route, { shell: 'admin', allowNotFound })
    })
  }

  test('admin customer profile', async () => {
    test.skip(!customerId, 'No customer row was available in the live list.')
    await assertRoute(page, `/customers/${customerId}`, { shell: 'admin' })
  })

  test('admin customer finance selection', async () => {
    test.skip(!customerId, 'No customer row was available in the live list.')
    await assertRoute(page, `/customers/${customerId}/finance`, {
      shell: 'admin'
    })
  })

  test('clicking a live loan line opens the full loan summary', async () => {
    await page.goto('/daily')

    const row = page.locator('tr[data-finance-id]').first()
    test.skip((await row.count()) === 0, 'No loan rows were available in the live list.')

    await row.locator('td').first().click()

    const dialog = page.getByRole('dialog', { name: /loan summary/i })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('EMI / Installment')
    await expect(dialog).toContainText('Payment History')

    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
  })

  for (const type of ['daily', 'weekly', 'monthly', 'interest-only']) {
    test(`admin manage ${type} record`, async () => {
      const id = financeIds[type]
      test.skip(!id, `No ${type} record was available in Pending.`)
      await assertRoute(page, `/${type}/${id}`, {
        shell: 'admin',
        allowNotFound: true
      })
    })
  }

  test('admin session is blocked from agent home and retired portal URL', async () => {
    await page.goto('/agent')
    await expect(page).toHaveURL((url) => url.pathname === '/admin')

    await page.goto('/client')
    await expect(page).toHaveURL((url) => url.pathname === '/admin')
  })

  test('theme switch toggles and restores the theme', async () => {
    await page.goto('/admin')
    const switchControl = page.locator('.app-navbar [role="switch"]')
    await expect(switchControl).toBeVisible()

    const before = await page.evaluate(
      () => document.documentElement.dataset.theme
    )
    await switchControl.click()
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
      .not.toBe(before)

    await switchControl.click()
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
      .toBe(before)
  })

  test('mobile admin drawer opens and closes on navigation', async ({
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'mobile',
      'Mobile drawer is only exercised in the mobile project.'
    )

    await page.goto('/admin')
    const toggle = page.locator('.mobile-nav-toggle')
    await expect(toggle).toBeVisible()

    await toggle.click()
    await expect(page.locator('#admin-sidebar')).toHaveClass(/is-open/)
    await expect(page.locator('.sidebar-scrim')).toHaveClass(/is-visible/)

    await page.locator('#admin-sidebar a[href="/loans"]').click()
    await expect(page).toHaveURL((url) => url.pathname === '/loans')
    await expect(page.locator('#admin-sidebar')).not.toHaveClass(/is-open/)
  })

  test('no uncaught page errors on admin pages', async () => {
    expect(pageErrors).toEqual([])
  })
})

test.describe('full app sweep - agent', () => {
  let context
  let page
  let collectionId = null
  const pageErrors = []

  test.beforeAll(async ({ browser }, testInfo) => {
    context = await browser.newContext({
      baseURL: testInfo.project.use.baseURL,
      viewport: testInfo.project.use.viewport,
      deviceScaleFactor: testInfo.project.use.deviceScaleFactor,
      isMobile: testInfo.project.use.isMobile,
      hasTouch: testInfo.project.use.hasTouch
    })
    page = await context.newPage()
    page.on('pageerror', (error) => pageErrors.push(error.message))

    await loginAs(page, 'agent')
    collectionId = await discoverAgentCollectionId(page)
  })

  test.afterAll(async () => {
    if (context) await context.close()
  })

  for (const route of agentRoutes) {
    test(`agent page ${route}`, async () => {
      await assertRoute(page, route, { shell: 'agent' })
    })
  }

  test('agent collection form', async () => {
    test.skip(
      !collectionId,
      'No assigned collection was available in the live list.'
    )
    await assertRoute(page, `/agent/collection/${collectionId}`, {
      shell: 'agent'
    })
  })

  test('agent session is blocked from admin home and retired portal URL', async () => {
    await page.goto('/admin')
    await expect(page).toHaveURL((url) => url.pathname === '/agent')

    await page.goto('/client')
    await expect(page).toHaveURL((url) => url.pathname === '/agent')
  })

  test('mobile agent drawer opens and closes on navigation', async ({
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'mobile',
      'Mobile drawer is only exercised in the mobile project.'
    )

    await page.goto('/agent')
    const toggle = page.locator('.mobile-nav-toggle')
    await expect(toggle).toBeVisible()

    await toggle.click()
    await expect(page.locator('#agent-sidebar')).toHaveClass(/is-open/)
    await expect(page.locator('.sidebar-scrim')).toHaveClass(/is-visible/)

    await page.locator('#agent-sidebar a[href="/agent/today"]').click()
    await expect(page).toHaveURL((url) => url.pathname === '/agent/today')
    await expect(page.locator('#agent-sidebar')).not.toHaveClass(/is-open/)
  })

  test('mobile agent header, menu, drawer and content are aligned', async ({
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'mobile',
      'Alignment is only exercised in the mobile project.'
    )

    for (const route of ['/agent', '/agent/profile']) {
      await page.goto(route)
      await expect(page.locator('.agent-header')).toBeVisible()
      await page.waitForTimeout(750)

      const geometry = await page.evaluate(() => {
        const box = (selector) => {
          const element = document.querySelector(selector)
          if (!element) return null
          const rect = element.getBoundingClientRect()
          return { top: rect.top, bottom: rect.bottom }
        }

        const firstPage = document.querySelector('main.agent-main > *')

        return {
          navbarBottom: box('.app-navbar')?.bottom ?? 0,
          header: box('.agent-header'),
          toggle: box('.mobile-nav-toggle'),
          sidebar: box('#agent-sidebar'),
          contentTop: firstPage?.firstElementChild
            ? firstPage.firstElementChild.getBoundingClientRect().top
            : null,
          viewportHeight: window.innerHeight
        }
      })

      expect(
        Math.abs(geometry.header.top - geometry.navbarBottom)
      ).toBeLessThanOrEqual(2)
      expect(geometry.toggle.top).toBeGreaterThanOrEqual(
        geometry.header.bottom - 1
      )
      expect(
        Math.abs(geometry.sidebar.top - geometry.header.bottom)
      ).toBeLessThanOrEqual(2)
      expect(geometry.contentTop).toBeGreaterThanOrEqual(
        geometry.header.bottom
      )
      expect(
        geometry.contentTop - geometry.header.bottom
      ).toBeLessThanOrEqual(32)

      if (route === '/agent') {
        await page.locator('.mobile-nav-toggle').click()
        await expect(page.locator('#agent-sidebar')).toHaveClass(/is-open/)

        const drawer = await page.locator('#agent-sidebar').boundingBox()
        expect(
          Math.abs(drawer.y + drawer.height - geometry.viewportHeight)
        ).toBeLessThanOrEqual(2)
      }
    }
  })

  test('no uncaught page errors on agent pages', async () => {
    expect(pageErrors).toEqual([])
  })
})
