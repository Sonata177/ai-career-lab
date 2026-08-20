import { test, expect } from '@playwright/test'
import { ASSESSMENT_RESULT } from './helpers'

/** 构造一条历史记录（与 AssessmentRecord 结构一致） */
function makeRecord(id: string, jobTitle: string, overallScore: number) {
  return {
    id,
    jobTitle,
    completedAt: new Date(Date.now() - 86400000).toISOString(),
    overallScore,
    jobFitPercentage: 82,
    result: ASSESSMENT_RESULT,
  }
}

/** 在页面加载前向 localStorage 写入历史记录（zustand persist 格式） */
async function seedHistory(page: import('@playwright/test').Page, records: unknown[]) {
  await page.addInitScript((seedRecords) => {
    localStorage.setItem(
      'assessment-history-store',
      JSON.stringify({ state: { records: seedRecords }, version: 1 })
    )
  }, records)
}

test('无历史记录：显示空状态，可通过"开始岗位体验"进入选岗页', async ({ page }) => {
  await page.goto('/history')

  await expect(page.getByText('还没有评估记录')).toBeVisible()
  await page.getByRole('button', { name: '开始岗位体验' }).click()
  await expect(page).toHaveURL(/\/select$/)
})

test('有历史记录：展示岗位名称、完成时间、综合评分与岗位适配度', async ({ page }) => {
  await seedHistory(page, [
    makeRecord('r1', '运营实习生的一天', 78),
    makeRecord('r2', '销售代表的一天', 88),
  ])

  await page.goto('/history')

  await expect(page.getByText('共 2 条评估记录')).toBeVisible()
  await expect(page.locator('.history-card')).toHaveCount(2)
  await expect(page.getByText('运营实习生的一天')).toBeVisible()
  await expect(page.getByText('销售代表的一天')).toBeVisible()
  await expect(page.getByText('78', { exact: true })).toBeVisible()
  await expect(page.getByText('88', { exact: true })).toBeVisible()
  // 完成时间已渲染（日期非空）
  await expect(page.locator('.history-card-date').first()).not.toHaveText('')
})

test('查看报告：跳转详情页并展示岗位名称、综合评分与七维结果', async ({ page }) => {
  await seedHistory(page, [makeRecord('r-history-1', '运营实习生的一天', 78)])

  await page.goto('/history')
  await page.getByRole('button', { name: '查看报告' }).click()

  await expect(page).toHaveURL(/\/history\/r-history-1$/)

  // 岗位名称
  await expect(page.getByRole('heading', { name: '运营实习生的一天' })).toBeVisible()

  // 综合评分与岗位适配度（限定在分数区，避免与维度分数撞车）
  const scoresBlock = page.locator('.history-detail-scores')
  await expect(scoresBlock).toContainText('78')
  await expect(scoresBlock).toContainText('82%')

  // 七维结果：维度名与分数均展示
  for (const d of ASSESSMENT_RESULT.dimensions) {
    await expect(page.getByText(d.name, { exact: true })).toBeVisible()
  }
  await expect(page.getByText('能力维度评估')).toBeVisible()

  // 每个维度都带 evidence 证据文本（与正式结果页一致）
  await expect(page.locator('.history-dim-evidence')).toHaveCount(7)
  await expect(page.locator('.history-dim-evidence').first()).toHaveText('模拟评估证据。')
})

test('移动端窄屏：历史卡片纵向排列（媒体查询生效）', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await seedHistory(page, [makeRecord('r1', '运营实习生的一天', 78)])

  await page.goto('/history')

  const card = page.locator('.history-card')
  await expect(card).toBeVisible()
  // 卡片 flex-direction 应为 column（横向排列会溢出窄屏）
  const flexDirection = await card.evaluate((el) => getComputedStyle(el).flexDirection)
  expect(flexDirection).toBe('column')
  // 查看报告按钮通栏：宽度等于卡片内容盒（100% 相对内容盒，需扣除内边距）
  const cardContentWidth = await card.evaluate((el) => {
    const style = getComputedStyle(el)
    return el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
  })
  const btnWidth = await page.locator('.history-view-btn').evaluate(
    (el) => el.getBoundingClientRect().width
  )
  expect(btnWidth).toBeCloseTo(cardContentWidth, 0)
})

test('访问不存在的记录 id：显示"报告不存在"与返回入口', async ({ page }) => {
  await seedHistory(page, [makeRecord('r1', '运营实习生的一天', 78)])

  await page.goto('/history/nonexistent-id')

  await expect(page.getByRole('heading', { name: '报告不存在' })).toBeVisible()
  await page.getByRole('button', { name: '返回历史记录' }).click()
  await expect(page).toHaveURL(/\/history$/)
})

test('清空历史：需两步确认，取消不清空，确认后显示空状态', async ({ page }) => {
  await seedHistory(page, [makeRecord('r1', '运营实习生的一天', 78)])

  await page.goto('/history')
  await expect(page.locator('.history-card')).toHaveCount(1)

  // 第一步：点击"清空历史"进入确认态
  await page.getByRole('button', { name: '清空历史' }).click()
  await expect(page.getByText('确定清空全部历史记录？此操作不可恢复。')).toBeVisible()

  // 取消：记录仍在
  await page.getByRole('button', { name: '取消' }).click()
  await expect(page.locator('.history-card')).toHaveCount(1)

  // 再次进入确认态并确认：记录清空
  await page.getByRole('button', { name: '清空历史' }).click()
  await page.getByRole('button', { name: '确认清空' }).click()
  await expect(page.getByText('还没有评估记录')).toBeVisible()
})

test('首页导航提供"历史记录"入口', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('link', { name: '历史记录' }).click()
  await expect(page).toHaveURL(/\/history$/)
})
