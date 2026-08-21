import { test, expect } from '@playwright/test'

test('进入岗位选择页：默认显示互联网岗位', async ({ page }) => {
  await page.goto('/select')

  await expect(page.getByRole('heading', { name: '选择你想体验的岗位' })).toBeVisible()
  await expect(page.getByText('运营实习生的一天')).toBeVisible()
})

test('点击"金融"：显示金融岗位，不显示互联网岗位', async ({ page }) => {
  await page.goto('/select')

  await page.getByRole('button', { name: /金融/ }).click()

  await expect(page.getByText('金融分析师的一天')).toBeVisible()
  await expect(page.getByText('运营实习生的一天')).toBeHidden()
})

test('搜索不存在的岗位：不发 API 请求并显示空状态提示', async ({ page }) => {
  let apiRequestCount = 0
  page.on('request', (req) => {
    if (req.url().includes('/api/')) apiRequestCount++
  })

  await page.goto('/select')

  // 打开搜索框并输入不存在的关键词
  await page.locator('.search-icon').click()
  await page.getByPlaceholder('输入你想要体验的岗位').fill('完全不存在的岗位')

  // 空状态提示可见
  await expect(page.getByText(
    '没有找到相关岗位，试试搜索其他关键词，或使用岗位真相镜。'
  )).toBeVisible()

  // 页面不依赖任何 API（岗位数据是静态的）
  expect(apiRequestCount).toBe(0)
})

test('有场景岗位按钮为"开始体验"，无场景岗位按钮为"用 JD 生成体验"', async ({ page }) => {
  await page.goto('/select')

  // 运营实习生（有内置场景）→ 开始体验
  const opsCard = page.locator('.job-card').filter({ hasText: '运营实习生的一天' })
  await expect(opsCard.getByRole('button', { name: '开始体验' })).toBeVisible()
  await expect(opsCard.getByRole('button', { name: '用 JD 生成体验' })).toBeHidden()

  // 产品助理 / 市场实习生 / HR实习生（无内置场景）→ 用 JD 生成体验
  for (const title of ['产品助理的一天', '市场实习生的一天', 'HR实习生的一天']) {
    const card = page.locator('.job-card').filter({ hasText: title })
    await expect(card.getByRole('button', { name: '用 JD 生成体验' })).toBeVisible()
    await expect(card.getByRole('button', { name: '开始体验' })).toBeHidden()
  }
})

test('无场景岗位：点击卡片不进入 /chat，跳转岗位真相镜并提示粘贴 JD', async ({ page }) => {
  await page.goto('/select')

  // 点击无场景岗位的产品助理卡片
  await page.locator('.job-card').filter({ hasText: '产品助理的一天' }).click()

  // 不能进入 /chat（避免空聊天来回弹），而是去岗位真相镜
  await expect(page).toHaveURL(/\/mirror$/)

  // 真相镜页展示"暂无内置场景"提示
  await expect(page.getByText(/「产品助理的一天」暂无内置体验场景/)).toBeVisible()
})

test('无场景岗位的"用 JD 生成体验"按钮：同样跳转岗位真相镜而非 /chat', async ({ page }) => {
  await page.goto('/select')

  await page.locator('.job-card').filter({ hasText: '产品助理的一天' })
    .getByRole('button', { name: '用 JD 生成体验' })
    .click()

  await expect(page).toHaveURL(/\/mirror$/)
  await expect(page.getByText(/「产品助理的一天」暂无内置体验场景/)).toBeVisible()
})
