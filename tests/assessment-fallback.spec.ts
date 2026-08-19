import { test, expect, type Page } from '@playwright/test'

/** 普通对话 SSE（固定内容） */
const CHAT_SSE = [
  'data: {"choices":[{"delta":{"content":"好的，收到！"}}]}\n\n',
  'data: [DONE]\n\n',
].join('')

/** 点击"跳过本轮"并等待指定 URL（用于某天的最后一个阶段） */
async function skipAndWaitUrl(page: Page, urlPattern: RegExp) {
  await page.locator('.skip-btn').click()
  await expect(page).toHaveURL(urlPattern, { timeout: 15000 })
}

/** 跳过当前阶段并选择下一个任务（用于中间阶段） */
async function skipToNextTask(page: Page) {
  await page.locator('.skip-btn').click()
  await expect(page.locator('.task-selector')).toBeVisible()
  await page.locator('.task-option-card').first().click()
  await expect(page.locator('.task-selector')).toBeHidden()
  await expect(page.locator('.skip-btn')).toBeEnabled() // 新阶段 AI 消息完成后可继续
}

test('评估请求返回 500：走兜底报告并跳转 /results，请求失败不重试（恰好 1 次）', async ({ page }) => {
  test.setTimeout(90000)

  // 拦截 API：普通对话返回 SSE；评估请求返回 500，并计数
  let assessmentRequestCount = 0
  await page.route('**/api/chat/completions', async (route) => {
    const body = route.request().postDataJSON()
    const isAssessment = Array.isArray(body?.messages) && body.messages.some(
      (m: unknown) =>
        typeof (m as { content?: unknown }).content === 'string' &&
        (m as { content: string }).content.includes('人才评估专家')
    )
    if (isAssessment) {
      assessmentRequestCount++
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'AI service error' }),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: CHAT_SSE,
    })
  })

  // 进入聊天页
  await page.goto('/')
  await page.getByRole('link', { name: '开始岗位体验' }).first().click()
  await expect(page).toHaveURL(/\/select$/)
  await page.getByRole('button', { name: '开始体验' }).first().click()
  await expect(page).toHaveURL(/\/chat$/)
  await expect(page.locator('.skip-btn')).toBeEnabled()

  // 全部跳过流程：Day 1（3 阶段）
  await skipToNextTask(page)                  // 阶段1 → 任务2
  await skipToNextTask(page)                  // 阶段2 → 任务3
  await skipAndWaitUrl(page, /\/day-complete$/) // 阶段3 → 换天页
  await page.getByRole('button', { name: '继续第 2 天' }).click()
  await expect(page).toHaveURL(/\/chat$/)
  await expect(page.locator('.skip-btn')).toBeEnabled()

  // Day 2（2 阶段）
  await skipToNextTask(page)                  // 阶段1 → 任务2
  await skipAndWaitUrl(page, /\/day-complete$/) // 阶段2 → 换天页
  await page.getByRole('button', { name: '继续第 3 天' }).click()
  await expect(page).toHaveURL(/\/chat$/)
  await expect(page.locator('.skip-btn')).toBeEnabled()

  // Day 3（2 阶段）→ 最后一个阶段触发评估
  await skipToNextTask(page)                  // 阶段1 → 任务2
  await skipAndWaitUrl(page, /\/results$/)    // 阶段2 → 评估 → 兜底 → /results

  // 兜底报告文案可见
  await expect(page.getByText(
    '评估报告生成失败，可能是网络波动或服务繁忙，请返回重新体验后再试。'
  )).toBeVisible()

  // 请求失败不重试：评估请求恰好 1 次
  // （与"解析失败最多重试一次"是不同规则：请求失败立即结束）
  expect(assessmentRequestCount).toBe(1)
})
