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
