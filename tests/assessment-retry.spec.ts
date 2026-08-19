import { test, expect } from '@playwright/test'
import {
  CHAT_SSE,
  isAssessmentRequest,
  enterChatFromHome,
  runAllSkipFlow,
  skipAndWaitUrl,
} from './helpers'

/** 七维评估结果（第二次评估返回，用于验证"显示第二次的评分"） */
const DIMENSIONS = [
  { name: '沟通表达', score: 85 },
  { name: '问题拆解', score: 72 },
  { name: '执行落地', score: 90 },
  { name: '用户同理心', score: 78 },
  { name: '数据敏感度', score: 65 },
  { name: '优先级判断', score: 80 },
  { name: '协作与求助', score: 75 },
]

const ASSESSMENT_RESULT = {
  overallScore: 78,
  jobFitPercentage: 82,
  dimensions: DIMENSIONS.map((d) => ({
    ...d,
    evidence: '模拟评估证据。',
    color: '#3b82f6',
  })),
  strengths: ['结构化表达能力强'],
  improvements: ['数据准备不足'],
  suggestions: ['建立数据复盘习惯'],
  fitAdvice: '整体适配度较高。',
}

/** 第一次评估：返回非法 JSON（模型输出纯文本，没有 JSON 对象） */
const INVALID_ASSESSMENT_SSE = [
  'data: {"choices":[{"delta":{"content":"抱歉，我暂时无法生成结构化评估报告。"}}]}\n\n',
  'data: [DONE]\n\n',
].join('')

/** 第二次评估：合法七维 JSON */
const VALID_ASSESSMENT_SSE = 'data: ' + JSON.stringify({
  choices: [{ delta: { content: JSON.stringify(ASSESSMENT_RESULT) } }],
}) + '\n\ndata: [DONE]\n\n'

test('评估返回非法 JSON：第一次解析失败后重试，第二次成功显示正常报告（恰好 2 次请求）', async ({ page }) => {
  test.setTimeout(90000)

  // 拦截 API：普通对话返回 SSE；评估请求第 1 次返回非法 JSON、第 2 次返回合法七维结果，并计数
  let assessmentRequestCount = 0
  await page.route('**/api/chat/completions', async (route) => {
    if (isAssessmentRequest(route.request().postDataJSON())) {
      assessmentRequestCount++
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: assessmentRequestCount === 1 ? INVALID_ASSESSMENT_SSE : VALID_ASSESSMENT_SSE,
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

  // 第一次非法 JSON → 重试一次 → 恰好 2 次评估请求
  expect(assessmentRequestCount).toBe(2)

  // 显示第二次返回的评分
  await expect(page.locator('.score-number')).toHaveText('78')
  await expect(page.getByText('岗位适配度 82%')).toBeVisible()
  for (const d of DIMENSIONS) {
    await expect(page.getByText(d.name, { exact: true })).toBeVisible()
  }
})
