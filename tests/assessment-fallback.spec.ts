import { test, expect } from '@playwright/test'
import {
  CHAT_SSE,
  isAssessmentRequest,
  enterChatFromHome,
  runAllSkipFlow,
  skipAndWaitUrl,
} from './helpers'

test('评估请求返回 500：走兜底报告并跳转 /results，请求失败不重试（恰好 1 次）', async ({ page }) => {
  test.setTimeout(90000)

  // 拦截 API：普通对话返回 SSE；评估请求返回 500，并计数
  let assessmentRequestCount = 0
  await page.route('**/api/chat/completions', async (route) => {
    if (isAssessmentRequest(route.request().postDataJSON())) {
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

  // 全部跳过流程，最后一步触发评估
  await enterChatFromHome(page)
  await runAllSkipFlow(page)
  await skipAndWaitUrl(page, /\/results$/)

  // 兜底报告文案可见
  await expect(page.getByText(
    '评估报告生成失败，可能是网络波动或服务繁忙，请返回重新体验后再试。'
  )).toBeVisible()

  // 请求失败不重试：评估请求恰好 1 次
  // （与"解析失败最多重试一次"是不同规则：请求失败立即结束）
  expect(assessmentRequestCount).toBe(1)
})
