import { test, expect, type Page } from '@playwright/test'
import { CHAT_SSE, enterChatFromHome } from './helpers'

/** 聊天输入区的发送按钮（同事抽屉也有同名按钮，需限定作用域） */
function sendBtn(page: Page) {
  return page.locator('.chat-input-form').getByRole('button', { name: '发送' })
}

/** 发送 3 条消息完成当前阶段（messageThreshold=3） */
async function completePhase(page: Page) {
  for (let i = 0; i < 3; i++) {
    await page.getByPlaceholder('输入你的回复...').fill(`任务回复 ${i + 1}`)
    await sendBtn(page).click()
    if (i < 2) await expect(sendBtn(page)).toBeEnabled()
  }
  await expect(page.locator('.task-selector')).toBeVisible()
  await page.locator('.task-option-card').first().click()
  await expect(page.locator('.task-selector')).toBeHidden()
  await expect(sendBtn(page)).toBeEnabled()
}

/** 发送 3 条消息并停在任务选择器打开状态（不点击任务） */
async function reachTaskSelector(page: Page) {
  for (let i = 0; i < 3; i++) {
    await page.getByPlaceholder('输入你的回复...').fill(`任务回复 ${i + 1}`)
    await sendBtn(page).click()
    if (i < 2) await expect(sendBtn(page)).toBeEnabled()
  }
  await expect(page.locator('.task-selector')).toBeVisible()
}

test('刷新 /chat：消息、任务位置与时间轴保留，不重发开场消息，输入框可用', async ({ page }) => {
  test.setTimeout(60000)
  await page.route('**/api/chat/completions', async (route) => {
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: CHAT_SSE })
  })

  // 1. 进入 Day 1，完成一个任务并进入第二个任务
  await enterChatFromHome(page)
  await completePhase(page)

  // 刷新前快照：两个阶段已启动（⏰ ×2）、用户消息 3 条、AI 回复数、时间轴 3 步且第 2 步 active
  const phaseMarkersBefore = await page.getByText(/⏰/).count()
  const aiMessagesBefore = await page.getByText('好的，收到！').count()
  expect(phaseMarkersBefore).toBe(2)
  await expect(page.locator('.timeline-step')).toHaveCount(3)
  await expect(page.locator('.timeline-step.active')).toHaveCount(1)
  await expect(page.locator('.timeline-step.completed')).toHaveCount(1)

  // 2. 刷新
  await page.reload()

  // 3. 已有消息仍存在（用户消息与阶段标记都在，数量不变）
  await expect(page.getByText('任务回复 1', { exact: true })).toBeVisible()
  await expect(page.getByText(/⏰/)).toHaveCount(phaseMarkersBefore)

  // 4. 当前任务与时间轴位置不变（仍为第 2 个阶段 active）
  await expect(page.locator('.timeline-step')).toHaveCount(3)
  await expect(page.locator('.timeline-step.active')).toHaveCount(1)
  await expect(page.locator('.timeline-step.completed')).toHaveCount(1)

  // 5. 不额外发送 AI 开场消息（AI 消息总数与刷新前一致）
  await expect(page.getByText('好的，收到！')).toHaveCount(aiMessagesBefore)

  // 6. 输入框恢复可用
  await expect(sendBtn(page)).toBeEnabled()
  await expect(page.getByPlaceholder('输入你的回复...')).toBeEnabled()
})

test('选择其他岗位后：旧会话被清除，新岗位全新开始且展示新岗位任务', async ({ page }) => {
  test.setTimeout(60000)
  await page.route('**/api/chat/completions', async (route) => {
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: CHAT_SSE })
  })

  // 先在运营岗位产生会话进度
  await enterChatFromHome(page)
  await completePhase(page)
  await expect(page.getByText('任务回复 1', { exact: true })).toBeVisible()

  // 退回选岗页，选择另一个岗位（金融 → 金融分析师的一天）
  await page.getByRole('button', { name: '退回岗位选择' }).click()
  await expect(page).toHaveURL(/\/select$/)
  await page.getByRole('button', { name: /金融/ }).click()
  await page.getByRole('button', { name: '开始体验' }).first().click()
  await expect(page).toHaveURL(/\/chat$/)

  // 旧会话已清除：无旧消息，全新 Day 1 开场（⏰ ×1 + AI 开场 ×1）
  await expect(page.getByText('任务回复 1', { exact: true })).toBeHidden()
  await expect(page.getByText(/⏰/)).toHaveCount(1)
  await expect(page.getByText('好的，收到！')).toHaveCount(1)
  await expect(sendBtn(page)).toBeEnabled()

  // 展示的是新岗位的任务（金融分析师 Day1 首任务"研究任务布置"），而非旧岗位题目
  await expect(page.getByText('金融分析师的一天 · Day 1')).toBeVisible()
  await expect(page.getByText('⏰ 09:00 — 研究任务布置', { exact: true })).toBeVisible()
})

test('任务选择器打开时刷新：选择器与候选项恢复，输入框保持禁用', async ({ page }) => {
  test.setTimeout(60000)
  await page.route('**/api/chat/completions', async (route) => {
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: CHAT_SSE })
  })

  await enterChatFromHome(page)
  await reachTaskSelector(page) // 3 条消息后任务选择器打开（剩 2 个任务），不点击

  await expect(page.locator('.task-selector')).toBeVisible()
  await expect(page.locator('.task-option-card')).toHaveCount(2)

  // 刷新：选择器状态（isSelectingTask）持久化，候选项由 activePhases 推导恢复
  await page.reload()

  await expect(page.locator('.task-selector')).toBeVisible()
  await expect(page.locator('.task-option-card')).toHaveCount(2)
  await expect(sendBtn(page)).toBeDisabled() // 选择器打开时输入框禁用

  // 选择任务 → 进入第二个阶段，输入框恢复
  await page.locator('.task-option-card').first().click()
  await expect(page.locator('.task-selector')).toBeHidden()
  await expect(page.getByText(/⏰/)).toHaveCount(2)
  await expect(sendBtn(page)).toBeEnabled()
})

test('AI 回复期间刷新：显示"上一请求因刷新中断"提示，消息保留、输入框可用', async ({ page }) => {
  test.setTimeout(60000)
  await page.route('**/api/chat/completions', async (route) => {
    const body = route.request().postDataJSON()
    const hasUser = Array.isArray(body?.messages) && body.messages.some((m) => m.role === 'user')
    if (hasUser) {
      // 模拟慢响应：用户消息发出后 AI 尚未返回
      await new Promise((r) => setTimeout(r, 4000))
    }
    try {
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body: CHAT_SSE })
    } catch {
      // 页面已因刷新关闭，忽略
    }
  })

  await enterChatFromHome(page)
  await expect(sendBtn(page)).toBeEnabled()

  // 发送一条消息后立即刷新（AI 回复被中断）
  await page.getByPlaceholder('输入你的回复...').fill('这条消息可能没有回复')
  await sendBtn(page).click()
  await page.waitForTimeout(500)
  await page.reload()

  // 中断提示可见，用户消息保留，输入框恢复可用
  await expect(page.getByText('上一请求因刷新中断，请重新发送。')).toBeVisible()
  await expect(page.getByText('这条消息可能没有回复', { exact: true })).toBeVisible()
  await expect(sendBtn(page)).toBeEnabled()
  // 该消息没有收到 AI 回复（只有开场消息一条）
  await expect(page.getByText('好的，收到！')).toHaveCount(1)
})

test('收到部分流式内容后刷新：仍显示中断提示（isAwaitingReply 判定，不靠消息角色）', async ({ page }) => {
  test.setTimeout(60000)
  // 拦截 fetch：开场请求返回正常 SSE；含用户消息的请求只发一个 chunk 且永不结束
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
      if (!hasUser) {
        const body = 'data: {"choices":[{"delta":{"content":"好的，收到！"}}]}\n\ndata: [DONE]\n\n'
        return new Response(
          new ReadableStream({ start(c) { c.enqueue(encoder.encode(body)); c.close() } }),
          { status: 200 }
        )
      }
      // 只发一个 chunk 且不 close：模拟"收到部分内容但响应未结束"
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"部分"}}]}\n\n'))
          },
        }),
        { status: 200 }
      )
    }
  })

  await enterChatFromHome(page)
  await expect(sendBtn(page)).toBeEnabled()

  // 发送消息 → 第一个 chunk 已写入 assistant 消息（最后一条消息是 assistant）
  await page.getByPlaceholder('输入你的回复...').fill('测试部分回复')
  await sendBtn(page).click()
  await expect(page.getByText('部分', { exact: true })).toBeVisible()
  await page.waitForTimeout(300)
  await page.reload()

  // isAwaitingReply 仍为 true → 中断提示可见（即使最后一条是 assistant）
  await expect(page.getByText('上一请求因刷新中断，请重新发送。')).toBeVisible()
  // 部分回复内容保留
  await expect(page.getByText('部分', { exact: true })).toBeVisible()
  await expect(sendBtn(page)).toBeEnabled()
})

test('同事询问记录刷新后保留（进入评估 Prompt 的数据不丢失）', async ({ page }) => {
  test.setTimeout(60000)
  await page.route('**/api/chat/completions', async (route) => {
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: CHAT_SSE })
  })

  await enterChatFromHome(page)
  await expect(sendBtn(page)).toBeEnabled()

  // 打开同事抽屉，发送一条求助消息
  await page.locator('.colleague-btn').click()
  await page.getByPlaceholder('问问小李...').fill('这个任务应该怎么拆解？')
  await page.locator('.colleague-input-bar button').click()
  await expect(page.getByText('这个任务应该怎么拆解？')).toBeVisible()
  await expect(page.locator('.colleague-msg.assistant')).toHaveCount(1)

  // 刷新后重新打开抽屉：记录仍在
  await page.reload()
  await page.locator('.colleague-btn').click()
  await expect(page.getByText('这个任务应该怎么拆解？')).toBeVisible()
  await expect(page.locator('.colleague-msg.assistant')).toHaveCount(1)
})
