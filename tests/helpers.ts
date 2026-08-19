import { expect, type Page } from '@playwright/test'

/** 普通对话 SSE（固定内容） */
export const CHAT_SSE = [
  'data: {"choices":[{"delta":{"content":"好的，收到！"}}]}\n\n',
  'data: [DONE]\n\n',
].join('')

/** 判断是否为评估请求（评估 prompt 含"人才评估专家"） */
export function isAssessmentRequest(postData: unknown): boolean {
  const body = postData as { messages?: unknown[] } | null
  return Array.isArray(body?.messages) && body.messages.some(
    (m: unknown) =>
      typeof (m as { content?: unknown }).content === 'string' &&
      (m as { content: string }).content.includes('人才评估专家')
  )
}

/** 点击"跳过本轮"并等待指定 URL（用于某天的最后一个阶段） */
export async function skipAndWaitUrl(page: Page, urlPattern: RegExp) {
  await page.locator('.skip-btn').click()
  await expect(page).toHaveURL(urlPattern, { timeout: 15000 })
}

/** 跳过当前阶段并选择下一个任务（用于中间阶段） */
export async function skipToNextTask(page: Page) {
  await page.locator('.skip-btn').click()
  await expect(page.locator('.task-selector')).toBeVisible()
  await page.locator('.task-option-card').first().click()
  await expect(page.locator('.task-selector')).toBeHidden()
  await expect(page.locator('.skip-btn')).toBeEnabled()
}

/** 从首页进入聊天页（首页 → 选岗 → /chat） */
export async function enterChatFromHome(page: Page) {
  await page.goto('/')
  await page.getByRole('link', { name: '开始岗位体验' }).first().click()
  await expect(page).toHaveURL(/\/select$/)
  await page.getByRole('button', { name: '开始体验' }).first().click()
  await expect(page).toHaveURL(/\/chat$/)
  await expect(page.locator('.skip-btn')).toBeEnabled()
}

/**
 * 完整"全部跳过"流程：
 * Day 1（3 阶段）→ 换天 → Day 2（2 阶段）→ 换天 → Day 3（2 阶段中的第 1 个）
 * 结束后停留在 Day 3 最后一个阶段，由调用方执行最后的 skip 触发评估。
 */
export async function runAllSkipFlow(page: Page) {
  // Day 1
  await skipToNextTask(page)
  await skipToNextTask(page)
  await skipAndWaitUrl(page, /\/day-complete$/)
  await page.getByRole('button', { name: '继续第 2 天' }).click()
  await expect(page).toHaveURL(/\/chat$/)
  await expect(page.locator('.skip-btn')).toBeEnabled()

  // Day 2
  await skipToNextTask(page)
  await skipAndWaitUrl(page, /\/day-complete$/)
  await page.getByRole('button', { name: '继续第 3 天' }).click()
  await expect(page).toHaveURL(/\/chat$/)
  await expect(page.locator('.skip-btn')).toBeEnabled()

  // Day 3（最后一个阶段留给调用方触发评估）
  await skipToNextTask(page)
}
