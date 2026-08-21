import { test, expect, type Page } from '@playwright/test'
import {
  CHAT_SSE,
  ASSESSMENT_SSE,
  isAssessmentRequest,
  enterChatFromHome,
  runAllSkipFlow,
} from './helpers'

function sendBtn(page: Page) {
  return page.locator('.chat-input-form').getByRole('button', { name: '发送' })
}

/**
 * 拦截 /api/chat/completions：
 * - 评估请求 → 七维评估 JSON，并把评估 prompt 内容收集到 bodies
 * - 其余对话请求 → 固定 SSE 回复（代答生成请求同样返回固定文本）
 */
async function mockChatApi(page: Page, assessmentBodies: string[]) {
  await page.route('**/api/chat/completions', async (route) => {
    const body = route.request().postDataJSON()
    if (isAssessmentRequest(body)) {
      const last = (body as { messages?: unknown[] }).messages ?? []
      const content = last.length > 0
        ? (last[last.length - 1] as { content?: unknown }).content ?? ''
        : ''
      assessmentBodies.push(String(content))
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: ASSESSMENT_SSE,
      })
      return
    }
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: CHAT_SSE })
  })
}

/** 空输入连点 5 次发送：触发 AI 代答 */
async function triggerAutoGen(page: Page) {
  for (let i = 0; i < 5; i++) {
    await sendBtn(page).click()
  }
}

/** 发送完最后一个阶段的跳过 → 等待评估完成进入 /results */
async function finishWithAssessment(page: Page) {
  await page.locator('.skip-btn').click()
  await expect(page).toHaveURL(/\/results$/, { timeout: 15000 })
}

test('手动输入不带"AI 代答"标签；空输入连点 5 次触发代答，代答消息带标签', async ({ page }) => {
  test.setTimeout(60000)
  await mockChatApi(page, [])
  await enterChatFromHome(page)

  // 手动发送一条消息：气泡无标签
  await page.getByPlaceholder('输入你的回复...').fill('我的手动回复')
  await sendBtn(page).click()
  await expect(page.getByText('我的手动回复', { exact: true })).toBeVisible()
  await expect(page.locator('.auto-gen-label')).toHaveCount(0)

  // 空输入连点 5 次 → 触发 AI 代答
  await triggerAutoGen(page)

  // 代答消息（好的，收到！）带"AI 代答"标签；手打消息仍无标签
  const labeled = page.locator('.message-bubble.user').filter({ has: page.locator('.auto-gen-label') })
  await expect(labeled).toHaveCount(1)
  await expect(labeled).toContainText('好的，收到！')
  const manual = page.locator('.message-bubble.user').filter({ hasText: '我的手动回复' })
  await expect(manual.locator('.auto-gen-label')).toHaveCount(0)
})

test('快速发送按钮在 2 次代答后出现；刷新后"AI 代答"标签保留', async ({ page }) => {
  test.setTimeout(60000)
  await mockChatApi(page, [])
  await enterChatFromHome(page)

  // 两次空输入连点 5 次 → 2 条 AI 代答
  for (let i = 0; i < 2; i++) {
    await triggerAutoGen(page)
    await expect(page.locator('.auto-gen-label')).toHaveCount(i + 1)
  }

  // autoGenCount >= 2 → 快速发送按钮出现
  await expect(page.getByRole('button', { name: '快速发送' })).toBeVisible()

  // 刷新：标签保留（消息持久化）
  await page.reload()
  await expect(sendBtn(page)).toBeEnabled()
  await expect(page.locator('.auto-gen-label')).toHaveCount(2)

  // 刷新后再次代答：消息仍带标签
  await triggerAutoGen(page)
  await expect(page.locator('.auto-gen-label')).toHaveCount(3)
})

test('点击"快速发送"：消息同样带"AI 代答"标签', async ({ page }) => {
  test.setTimeout(60000)
  await mockChatApi(page, [])
  await enterChatFromHome(page)

  // 2 次空输入连点 5 次 → 快速发送按钮出现
  await triggerAutoGen(page)
  await expect(page.locator('.auto-gen-label')).toHaveCount(1)
  await triggerAutoGen(page)
  await expect(page.locator('.auto-gen-label')).toHaveCount(2)
  await expect(page.getByRole('button', { name: '快速发送' })).toBeVisible()

  // 点击快速发送 → 第 3 条代答消息同样带标签
  await page.getByRole('button', { name: '快速发送' }).click()
  await expect(page.locator('.auto-gen-label')).toHaveCount(3)
})

test('评估请求：AI 代答标注"不作为能力证据"，手打/跳过消息照旧', async ({ page }) => {
  test.setTimeout(90000)
  const assessmentBodies: string[] = []
  await mockChatApi(page, assessmentBodies)
  await enterChatFromHome(page)

  // 前两天全部跳过，来到 Day 3 最后一个阶段
  // （每天切换会重置对话，评估只基于最后一天的对话记录）
  await runAllSkipFlow(page)

  // 在最后一天：手动 1 条 + 代答 1 条，都会进入最终评估的对话记录
  await page.getByPlaceholder('输入你的回复...').fill('我的手动回复')
  await sendBtn(page).click()
  await expect(page.getByText('我的手动回复', { exact: true })).toBeVisible()
  await triggerAutoGen(page)
  await expect(page.locator('.auto-gen-label')).toHaveCount(1)

  // 跳过最后阶段 → 触发评估
  await finishWithAssessment(page)

  const prompt = assessmentBodies[0] ?? ''
  // 代答消息在对话记录中标注"不作为能力证据"
  expect(prompt).toContain('[实习生(AI代答，不作为能力证据)]: 好的，收到！')
  expect(prompt).toContain('AI代答说明')
  expect(prompt).toContain('严禁作为评分证据')
  // 手打消息为普通"实习生"标记，跳过消息照旧
  expect(prompt).toContain('[实习生]: 我的手动回复')
  expect(prompt).toContain('[用户跳过了本轮任务')
  expect(prompt).toContain('严重警告') // Day 3 两阶段均跳过：全部跳过惩罚与代答标注共存
})

test('评估请求：销售岗位证据侧重（客户沟通/异议处理类任务）', async ({ page }) => {
  test.setTimeout(90000)
  const assessmentBodies: string[] = []
  await mockChatApi(page, assessmentBodies)

  // 首页 → 选岗 → 销售分类 → 销售代表（有内置场景）
  await page.goto('/')
  await page.getByRole('link', { name: '开始岗位体验' }).first().click()
  await expect(page).toHaveURL(/\/select$/)
  await page.getByRole('button', { name: /销售/ }).click()
  await page.locator('.job-card').filter({ hasText: '销售代表的一天' }).click()
  await expect(page).toHaveURL(/\/chat$/)
  await expect(page.locator('.skip-btn')).toBeEnabled()

  await runAllSkipFlow(page)
  await finishWithAssessment(page)

  const prompt = assessmentBodies[0] ?? ''
  // 场景侧重维度：客户沟通/目标导向等非标准维度按任务列出
  expect(prompt).toContain('岗位证据侧重')
  expect(prompt).toContain('客户沟通：客户沟通')
  expect(prompt).toContain('需求挖掘：客户沟通')
  expect(prompt).toContain('目标导向：晨会分配客户')
  // 标准维度 → 任务对应
  expect(prompt).toContain('维度与任务对应')
  expect(prompt).toContain('沟通表达 → 晨会分配客户')
  expect(prompt).toContain('执行落地 → 晨会分配客户')
})

test('评估请求：运营岗位维度任务对应；无代答时不包含 AI代答说明', async ({ page }) => {
  test.setTimeout(90000)
  const assessmentBodies: string[] = []
  await mockChatApi(page, assessmentBodies)
  await enterChatFromHome(page)

  await runAllSkipFlow(page)
  await finishWithAssessment(page)

  const prompt = assessmentBodies[0] ?? ''
  // 证据侧重与标准维度任务对应（运营剧本：晨会任务/用户沟通/今日汇报）
  expect(prompt).toContain('岗位证据侧重')
  expect(prompt).toContain('沟通表达：晨会任务、用户沟通、今日汇报')
  expect(prompt).toContain('维度与任务对应')
  expect(prompt).toContain('数据敏感度 → 今日汇报')
  // 全程无代答 → 不出现 AI代答说明
  expect(prompt).not.toContain('AI代答')
})
