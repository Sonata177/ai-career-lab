import { test, expect, type Page } from '@playwright/test'
import { CHAT_SSE, enterChatFromHome } from './helpers'

function sendBtn(page: Page) {
  return page.locator('.chat-input-form').getByRole('button', { name: '发送' })
}

/**
 * 路由：对"含用户消息"的请求计数，第 failAt 次返回 500，其余返回正常 SSE。
 * 开场请求（无用户消息）始终正常。
 */
async function mockWithFailures(page: Page, failAt: number) {
  let userRequests = 0
  await page.route('**/api/chat/completions', async (route) => {
    const body = route.request().postDataJSON()
    const hasUser = Array.isArray(body?.messages) && body.messages.some((m) => m.role === 'user')
    if (hasUser) {
      userRequests++
      if (userRequests === failAt) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'AI service error' }),
        })
        return
      }
    }
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: CHAT_SSE })
  })
}

async function sendMessage(page: Page, text: string) {
  await page.getByPlaceholder('输入你的回复...').fill(text)
  await sendBtn(page).click()
}

test('验收1+2：回复请求返回 500 出现"重新获取回复"，重试成功后用户消息仍只有一条', async ({ page }) => {
  test.setTimeout(60000)
  await mockWithFailures(page, 1) // 第一个用户消息请求失败

  await enterChatFromHome(page)
  await expect(sendBtn(page)).toBeEnabled()

  await sendMessage(page, '唯一的一条消息')

  // 失败 → 重试按钮出现；用户消息只有一条（未重复）
  await expect(page.getByRole('button', { name: '重新获取回复' })).toBeVisible()
  await expect(page.getByText('唯一的一条消息', { exact: true })).toHaveCount(1)

  // 点击重试 → 请求成功 → 按钮消失、AI 回复出现
  await page.getByRole('button', { name: '重新获取回复' }).click()
  await expect(page.getByRole('button', { name: '重新获取回复' })).toBeHidden()
  await expect(page.getByText('好的，收到！')).toHaveCount(2) // 开场 + 重试回复
  // 用户消息仍只有一条
  await expect(page.getByText('唯一的一条消息', { exact: true })).toHaveCount(1)
})

test('验收3+4：第三条消息失败时任务选择器不提前出现，重试成功后才出现', async ({ page }) => {
  test.setTimeout(60000)
  await mockWithFailures(page, 3) // 第三个用户消息请求失败

  await enterChatFromHome(page)
  await expect(sendBtn(page)).toBeEnabled()

  await sendMessage(page, '回复一')
  await expect(sendBtn(page)).toBeEnabled()
  await sendMessage(page, '回复二')
  await expect(sendBtn(page)).toBeEnabled()

  // 第三条失败：即使已达到 messageThreshold=3，任务选择器也不能提前出现
  await sendMessage(page, '回复三')
  await expect(page.getByRole('button', { name: '重新获取回复' })).toBeVisible()
  await expect(page.locator('.task-selector')).toBeHidden()

  // 重试成功 → 任务选择器出现
  await page.getByRole('button', { name: '重新获取回复' }).click()
  await expect(page.locator('.task-selector')).toBeVisible()
})

test('验收5：部分 SSE 后刷新，点击重试替换残缺回复，不保留两条 AI 回复', async ({ page }) => {
  test.setTimeout(60000)
  // 拦截 fetch：首次用户请求只发一个 chunk 且永不结束（模拟中断）；
  // 刷新后（sessionStorage 标记存在）的请求正常返回
  await page.addInitScript(() => {
    const origFetch = window.fetch.bind(window)
    window.fetch = async (input, init) => {
      const resp = await origFetch(input, init)
      const url = typeof input === 'string' ? input : input.url
      if (!url.includes('/api/chat/completions')) return resp
      const bodyText = typeof init?.body === 'string' ? init.body : ''
      const postData = bodyText ? JSON.parse(bodyText) : null
      const hasUser = Array.isArray(postData?.messages)
        && postData.messages.some((m) => m.role === 'user')
      const encoder = new TextEncoder()
      const normal = () => new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"好的，收到！"}}]}\n\ndata: [DONE]\n\n'))
            c.close()
          },
        }),
        { status: 200 }
      )
      if (!hasUser) return normal()
      if (!sessionStorage.getItem('hang-sent')) {
        // 刷新前的首次用户请求：只发一个 chunk 且不结束
        sessionStorage.setItem('hang-sent', '1')
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"残缺"}}]}\n\n'))
            },
          }),
          { status: 200 }
        )
      }
      return normal() // 刷新后的重试请求正常返回
    }
  })

  await enterChatFromHome(page)
  await expect(sendBtn(page)).toBeEnabled()

  await sendMessage(page, '测试部分')
  await expect(page.getByText('残缺', { exact: true })).toBeVisible()
  await page.waitForTimeout(300)
  await page.reload()

  // 刷新中断 → 重试按钮出现
  await expect(page.getByRole('button', { name: '重新获取回复' })).toBeVisible()

  // 点击重试 → 残缺回复被删除并替换为完整回复
  await page.getByRole('button', { name: '重新获取回复' }).click()
  await expect(page.getByText('残缺', { exact: true })).toBeHidden()
  await expect(page.getByText('好的，收到！')).toHaveCount(2) // 开场 + 重试成功回复
  // 用户消息只有一条
  await expect(page.getByText('测试部分', { exact: true })).toHaveCount(1)
})

test('可重试状态下：输入/发送/跳过全部禁用，唯一操作是重试', async ({ page }) => {
  test.setTimeout(60000)
  await mockWithFailures(page, 1)

  await enterChatFromHome(page)
  await expect(sendBtn(page)).toBeEnabled()

  await sendMessage(page, '失败的消息')

  // 可重试状态：重试按钮出现，输入框、发送、跳过全部禁用
  await expect(page.getByRole('button', { name: '重新获取回复' })).toBeVisible()
  await expect(page.locator('.chat-textarea')).toBeDisabled()
  await expect(sendBtn(page)).toBeDisabled()
  await expect(page.locator('.skip-btn')).toBeDisabled()

  // 尝试强制点击跳过也不生效（函数级保护）：重试按钮仍在
  await page.locator('.skip-btn').click({ force: true })
  await expect(page.getByRole('button', { name: '重新获取回复' })).toBeVisible()

  // 重试成功 → 一切恢复可用
  await page.getByRole('button', { name: '重新获取回复' }).click()
  await expect(page.getByRole('button', { name: '重新获取回复' })).toBeHidden()
  await expect(page.locator('.chat-textarea')).toBeEnabled()
  await expect(sendBtn(page)).toBeEnabled()
  await expect(page.locator('.skip-btn')).toBeEnabled()
})
