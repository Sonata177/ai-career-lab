import { test, expect } from '@playwright/test'

test('首页可以进入岗位选择并开始体验', async ({ page }) => {
  await page.goto('/')

  // 导航 logo 是唯一含品牌名的 link（页面文本中品牌名出现多处，需用角色定位器避免 strict mode violation）
  await expect(page.getByRole('link', { name: 'AI 职场体验舱' })).toBeVisible()
  // 首页有两个同文案链接（hero 区与 experience 区，均指向 /select），取第一个
  await page.getByRole('link', { name: '开始岗位体验' }).first().click()

  await expect(page).toHaveURL(/\/select$/)
  await expect(page.getByRole('heading', { name: '选择你想体验的岗位' })).toBeVisible()

  await page.getByRole('button', { name: '开始体验' }).first().click()

  await expect(page).toHaveURL(/\/chat$/)
})