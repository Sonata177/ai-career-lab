import { test, expect } from '@playwright/test'
import {
  CHAT_SSE,
  ASSESSMENT_SSE,
  ASSESSMENT_RESULT,
  isAssessmentRequest,
  mirrorSse,
  enterChatFromHome,
  skipToNextTask,
  skipAndWaitUrl,
} from './helpers'

/** 路由：对话 → CHAT_SSE；评估 → 传入的评估 SSE（默认 ASSESSMENT_SSE） */
async function mockApi(page: import('@playwright/test').Page, assessmentSse: string = ASSESSMENT_SSE) {
  await page.route('**/api/chat/completions', async (route) => {
    if (isAssessmentRequest(route.request().postDataJSON())) {
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body: assessmentSse })
      return
    }
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: CHAT_SSE })
  })
}

/** 全部跳过 Day 1 → 每日完成页（currentDay=1） */
async function reachDay1Complete(page: import('@playwright/test').Page) {
  await enterChatFromHome(page)
  await skipToNextTask(page)
  await skipToNextTask(page)
  await skipAndWaitUrl(page, /\/day-complete$/)
}

test('每日完成页"生成评估报告"：触发评估并跳转结果页', async ({ page }) => {
  test.setTimeout(60000)
  await mockApi(page)

  await reachDay1Complete(page)
  await page.getByRole('button', { name: '生成评估报告' }).click()

  // generateNow 路径：ChatPage 挂载即触发评估
  await expect(page).toHaveURL(/\/results$/, { timeout: 15000 })
  await expect(page.locator('.score-number')).toHaveText('78')
})

test('结果页"继续体验 Day 2"：进入第二天的聊天', async ({ page }) => {
  test.setTimeout(60000)
  // overallScore 88 >= 80 才会显示"继续体验 Day 2"按钮
  await mockApi(page, mirrorSse({ ...ASSESSMENT_RESULT, overallScore: 88 }))

  await reachDay1Complete(page)
  await page.getByRole('button', { name: '生成评估报告' }).click()
  await expect(page).toHaveURL(/\/results$/, { timeout: 15000 })

  const continueBtn = page.getByRole('button', { name: '继续体验 Day 2' })
  await expect(continueBtn).toBeVisible()
  await continueBtn.click()

  // 进入第二天聊天页
  await expect(page).toHaveURL(/\/chat$/)
  await expect(page.getByText('运营实习生的一天 · Day 2')).toBeVisible()
})

test('结果页"返回首页 / 体验其他岗位 / 返回对话"：均能正确跳转', async ({ page }) => {
  test.setTimeout(60000)
  await mockApi(page)

  await reachDay1Complete(page)
  await page.getByRole('button', { name: '生成评估报告' }).click()
  await expect(page).toHaveURL(/\/results$/, { timeout: 15000 })

  // 返回首页 → /
  await page.getByRole('button', { name: '返回首页' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { name: /在投递前/ })).toBeVisible()

  // 返回结果页，体验其他岗位 → /select
  await page.goBack()
  await expect(page).toHaveURL(/\/results$/)
  await page.getByRole('button', { name: '体验其他岗位' }).click()
  await expect(page).toHaveURL(/\/select$/)
  await expect(page.getByRole('heading', { name: '选择你想体验的岗位' })).toBeVisible()

  // 返回结果页，返回对话 → /chat（Day 1 重新开始）
  await page.goBack()
  await expect(page).toHaveURL(/\/results$/)
  await page.getByRole('button', { name: '返回对话' }).click()
  await expect(page).toHaveURL(/\/chat$/)
  await expect(page.getByText('运营实习生的一天 · Day 1')).toBeVisible()
})

test('结果页"导出评估报告"：触发下载，文件名与内容正确', async ({ page }) => {
  test.setTimeout(60000)
  await mockApi(page)

  await reachDay1Complete(page)
  await page.getByRole('button', { name: '生成评估报告' }).click()
  await expect(page).toHaveURL(/\/results$/, { timeout: 15000 })

  // 触发下载并捕获事件
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出评估报告' }).click()
  const download = await downloadPromise

  // 文件名断言
  expect(download.suggestedFilename()).toBe('assessment-report.json')

  // 读取文件内容：exportedAt / jobTitle / result 结构完整
  const stream = await download.createReadStream()
  let fileText = ''
  for await (const chunk of stream) {
    fileText += chunk
  }
  const content = JSON.parse(fileText)
  expect(content.exportedAt).toBeTruthy()
  expect(content.jobTitle).toBe('运营实习生的一天')
  expect(content.result.overallScore).toBe(78)
  expect(content.result.dimensions).toHaveLength(7)
})

test('刷新结果页：评分、岗位名称与"继续体验 Day 2"均保留（sessionStorage 持久化）', async ({ page }) => {
  test.setTimeout(60000)
  // Day 1 高分报告（88 >= 80，刷新后继续按钮应仍在）
  await mockApi(page, mirrorSse({ ...ASSESSMENT_RESULT, overallScore: 88 }))

  await reachDay1Complete(page)
  await page.getByRole('button', { name: '生成评估报告' }).click()
  await expect(page).toHaveURL(/\/results$/, { timeout: 15000 })
  await expect(page.locator('.score-number')).toHaveText('88')

  // 刷新：三个持久化字段都应恢复
  await page.reload()

  // result 已恢复：评分仍在
  await expect(page.locator('.score-number')).toHaveText('88')

  // selectedJob 已恢复：报告页岗位名称仍在
  await expect(page.getByText('运营实习生的一天 能力评估结果')).toBeVisible()

  // currentDay 已恢复（=== 1）+ score >= 80 → "继续体验 Day 2"仍显示
  await expect(page.getByRole('button', { name: '继续体验 Day 2' })).toBeVisible()
})

test('完成评估后写入历史记录（localStorage 持久化）', async ({ page }) => {
  test.setTimeout(60000)
  await mockApi(page)

  await reachDay1Complete(page)
  await page.getByRole('button', { name: '生成评估报告' }).click()
  await expect(page).toHaveURL(/\/results$/, { timeout: 15000 })

  // 历史记录已写入 localStorage（zustand persist 格式：{ state, version }）
  const stored = await page.evaluate(() =>
    localStorage.getItem('assessment-history-store')
  )
  expect(stored).toBeTruthy()
  const { state } = JSON.parse(stored as string)
  expect(state.records).toHaveLength(1)

  const record = state.records[0]
  expect(record.id).toBeTruthy()
  expect(record.jobTitle).toBe('运营实习生的一天')
  expect(Number.isNaN(Date.parse(record.completedAt))).toBe(false)
  expect(record.overallScore).toBe(78)
  expect(record.jobFitPercentage).toBe(82)
  // 七维评分统一从 result.dimensions 读取，顶层不重复存储
  expect(record.dimensions).toBeUndefined()
  expect(record.result.dimensions).toHaveLength(7)
  expect(record.result.overallScore).toBe(78)
})
