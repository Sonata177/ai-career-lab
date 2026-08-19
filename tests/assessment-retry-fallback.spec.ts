import { test, expect } from '@playwright/test'
import {
  CHAT_SSE,
  isAssessmentRequest,
  enterChatFromHome,
  runAllSkipFlow,
  skipAndWaitUrl,
} from './helpers'

/** 非法评估内容：HTTP 200 + 无 JSON 对象的纯文本（走"解析失败"分支，不是 500 的"请求失败"分支） */
const INVALID_ASSESSMENT_SSE = [
  'data: {"choices":[{"delta":{"content":"抱歉，我无法生成结构化评估报告。"}}]}\n\n',
  'data: [DONE]\n\n',
].join('')

test('评估连续两次返回非法 JSON：重试一次后仍失败，走兜底报告（恰好 2 次请求）', async ({ page }) => {
  test.setTimeout(90000)

  // 拦截 API：普通对话返回 SSE；评估请求每次都返回 HTTP 200 + 非法内容，并计数
  let assessmentRequestCount = 0
  await page.route('**/api/chat/completions', async (route) => {
    if (isAssessmentRequest(route.request().postDataJSON())) {
      assessmentRequestCount++
      // 注意：必须返回 200 + 非法内容（若返回 500 会走"请求错误不重试"分支，次数会是 1）
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: INVALID_ASSESSMENT_SSE,
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

  // 两次都解析失败 → 重试一次 → 恰好 2 次评估请求
  expect(assessmentRequestCount).toBe(2)

  // 两次均失败 → 兜底报告
  await expect(page.getByText(
    '评估报告生成失败，可能是网络波动或服务繁忙，请返回重新体验后再试。'
  )).toBeVisible()
})
