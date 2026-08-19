import { test, expect, type Page } from '@playwright/test'

/** 七维评估结果（与前端校验白名单一致） */
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

/** 对话 SSE：固定内容（前端只解析 delta.content） */
const CHAT_SSE = [
  'data: {"choices":[{"delta":{"content":"好的，收到！"}}]}\n\n',
  'data: [DONE]\n\n',
].join('')

/** 评估 SSE：单条 data 行携带完整七维 JSON */
const ASSESSMENT_SSE = 'data: ' + JSON.stringify({
  choices: [{ delta: { content: JSON.stringify(ASSESSMENT_RESULT) } }],
}) + '\n\ndata: [DONE]\n\n'

/**
 * 拦截 /api/chat/completions：
 * - 评估请求（prompt 含"人才评估专家"）→ 返回七维评估 JSON
 * - 其余对话请求 → 返回固定 SSE 回复
 */
async function mockChatApi(page: Page) {
  await page.route('**/api/chat/completions', async (route) => {
    const body = route.request().postDataJSON()
    const isAssessment = Array.isArray(body?.messages) && body.messages.some(
      (m: unknown) =>
        typeof (m as { content?: unknown }).content === 'string' &&
        (m as { content: string }).content.includes('人才评估专家')
    )
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: isAssessment ? ASSESSMENT_SSE : CHAT_SSE,
    })
  })
}

/** 聊天输入区的发送按钮（页面中同事抽屉也有同名按钮，需限定作用域） */
function sendBtn(page: Page) {
  return page.locator('.chat-input-form').getByRole('button', { name: '发送' })
}

/** 发送 count 条消息（每阶段 messageThreshold=3）；前 count-1 条等 AI 回复完成（发送按钮重新可用） */
async function sendMessages(page: Page, count: number) {
  for (let i = 0; i < count; i++) {
    await page.getByPlaceholder('输入你的回复...').fill(`任务回复 ${i + 1}`)
    await sendBtn(page).click()
    if (i < count - 1) {
      await expect(sendBtn(page)).toBeEnabled() // AI 回复期间按钮禁用，恢复即可继续
    }
  }
}

/** 完成一个中间阶段：3 条消息 → 任务选择器出现 → 选第一个剩余任务 */
async function completeMidPhase(page: Page) {
  await sendMessages(page, 3)
  await expect(page.locator('.task-selector')).toBeVisible()
  await page.locator('.task-option-card').first().click()
  await expect(page.locator('.task-selector')).toBeHidden()
  await expect(sendBtn(page)).toBeEnabled()
}

/** 完成某天的最后一个阶段：3 条消息 → 跳转 /day-complete */
async function completeFinalPhaseOfDay(page: Page) {
  await sendMessages(page, 3)
  await expect(page).toHaveURL(/\/day-complete$/)
}

test('完整体验流程：选岗 → 完成任务 → 评估报告展示七维结果', async ({ page }) => {
  test.setTimeout(90000)
  await mockChatApi(page)

  // 1. 首页 → 选岗 → 聊天页
  await page.goto('/')
  await page.getByRole('link', { name: '开始岗位体验' }).first().click()
  await expect(page).toHaveURL(/\/select$/)

  await page.getByRole('button', { name: '开始体验' }).first().click()
  await expect(page).toHaveURL(/\/chat$/)
  await expect(sendBtn(page)).toBeEnabled()

  // 2. 模拟完成任务：Day 1（3 个阶段）
  await completeMidPhase(page)          // 阶段1 → 选任务2
  await completeMidPhase(page)          // 阶段2 → 选任务3
  await completeFinalPhaseOfDay(page)   // 阶段3 → 换天页
  await page.getByRole('button', { name: '继续第 2 天' }).click()
  await expect(page).toHaveURL(/\/chat$/)
  await expect(sendBtn(page)).toBeEnabled()

  // Day 2（2 个阶段）
  await completeMidPhase(page)          // 阶段1 → 选任务2
  await completeFinalPhaseOfDay(page)   // 阶段2 → 换天页
  await page.getByRole('button', { name: '继续第 3 天' }).click()
  await expect(page).toHaveURL(/\/chat$/)
  await expect(sendBtn(page)).toBeEnabled()

  // Day 3（2 个阶段）→ 最后一个阶段完成触发评估
  await completeMidPhase(page)
  await sendMessages(page, 3)
  await expect(page).toHaveURL(/\/results$/, { timeout: 15000 })

  // 3. 报告页：综合评分 / 岗位适配度 / 七个维度
  await expect(page.locator('.score-number')).toHaveText('78')
  await expect(page.getByText('岗位适配度 82%')).toBeVisible()
  for (const d of DIMENSIONS) {
    await expect(page.getByText(d.name, { exact: true })).toBeVisible()
  }
})
