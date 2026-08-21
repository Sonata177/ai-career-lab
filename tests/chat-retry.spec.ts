import { test, expect, type Page } from '@playwright/test'
import { CHAT_SSE, enterChatFromHome, skipToNextTask, skipAndWaitUrl } from './helpers'

function sendBtn(page: Page) {
  return page.locator('.chat-input-form').getByRole('button', { name: '发送' })
}

type ReplyMode = 'hang' | 'chunks' | 'close'

/**
 * 用 fetch 包装器拦截 API（page.route 无法模拟"流式分时送达/永不结束"）：
 * - 开场请求（无用户消息）→ 正常 SSE
 * - 用户消息请求 → 按 window.__replyMode 返回：
 *   hang：永不发送数据、永不结束；chunks：每 10s 一个 chunk 永不结束；
 *   close：发一个 chunk 后直接关闭（无 [DONE]）
 */
async function installFetchWrapper(page: Page) {
  await page.addInitScript(() => {
    const origFetch = window.fetch.bind(window)
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      // 辅助函数提升到顶部，避免 async 转译后回调内出现 TDZ
      const markAborted = () => {
        (window as unknown as { __aborted?: boolean }).__aborted = true
      }
      const url = typeof input === 'string' ? input : input.url
      // API 请求直接返回 Mock；只有非 API 请求才调用真实 fetch（避免测试打到后端/真实模型）
      if (!url.includes('/api/chat/completions')) {
        return origFetch(input, init)
      }
      const bodyText = typeof init?.body === 'string' ? init.body : ''
      const postData = bodyText ? JSON.parse(bodyText) : null
      const hasUser = Array.isArray(postData?.messages)
        && postData.messages.some((m: { role?: string }) => m.role === 'user')
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
      if (!hasUser) {
        // 开场请求：默认正常 SSE；__openingMode='hang' 时挂起（测"开场请求挂起时离开页面"）
        if ((window as unknown as { __openingMode?: string }).__openingMode === 'hang') {
          let controllerRef: ReadableStreamDefaultController<Uint8Array>
          const stream = new ReadableStream<Uint8Array>({ start(c) { controllerRef = c } })
          init?.signal?.addEventListener('abort', () => {
            markAborted()
            controllerRef.error(new DOMException('Aborted', 'AbortError'))
          })
          return new Response(stream, { status: 200 })
        }
        return normal()
      }

      const mode = (window as unknown as { __replyMode?: string }).__replyMode
      if (mode === 'hang') {
        // 永不发送数据；signal 中止时让流报错（模拟浏览器行为：fetch 中止会弄脏 body 流）
        let controllerRef: ReadableStreamDefaultController<Uint8Array>
        const stream = new ReadableStream<Uint8Array>({ start(c) { controllerRef = c } })
        init?.signal?.addEventListener('abort', () => {
          markAborted()
          controllerRef.error(new DOMException('Aborted', 'AbortError'))
        })
        return new Response(stream, { status: 200 })
      }
      if (mode === 'chunks') {
        let controllerRef: ReadableStreamDefaultController<Uint8Array>
        const stream = new ReadableStream<Uint8Array>({ start(c) { controllerRef = c } })
        let count = 0
        const id = setInterval(() => {
          count++
          controllerRef.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"嘀"}}]}\n\n'))
          if (count >= 4) clearInterval(id) // 喂 4 个 chunk 后停止，流保持打开
        }, 10_000)
        init?.signal?.addEventListener('abort', () => {
          markAborted()
          clearInterval(id)
          controllerRef.error(new DOMException('Aborted', 'AbortError'))
        })
        return new Response(stream, { status: 200 })
      }
      if (mode === 'close') {
        return new Response(new ReadableStream({
          start(c) {
            c.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"部分2"}}]}\n\n'))
            c.close()
          },
        }), { status: 200 })
      }
      return normal()
    }
  })
}

function setReplyMode(page: Page, mode: ReplyMode) {
  return page.evaluate((m) => {
    (window as unknown as { __replyMode?: string }).__replyMode = m
  }, mode)
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
      const url = typeof input === 'string' ? input : input.url
      // API 请求直接返回 Mock；非 API 请求才走真实 fetch
      if (!url.includes('/api/chat/completions')) {
        return origFetch(input, init)
      }
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

test('验收1：请求一直不返回数据，无数据超时后出现"重新获取回复"', async ({ page }) => {
  test.setTimeout(60000)
  await installFetchWrapper(page)

  await enterChatFromHome(page)
  await expect(sendBtn(page)).toBeEnabled()

  // 安装假时钟后发送：无数据超时计时器为假时钟驱动
  await page.clock.install()
  await setReplyMode(page, 'hang')

  await sendMessage(page, '超时消息')
  // 推进 60s+ 无任何数据 → 无数据超时触发 → 中止 → 可重试
  await page.clock.runFor(61_000)

  await expect(page.getByRole('button', { name: '重新获取回复' })).toBeVisible()
  await expect(page.getByText('超时消息', { exact: true })).toHaveCount(1)
})

test('验收2：持续收到 chunk 不会误超时；停止喂数据后才超时', async ({ page }) => {
  test.setTimeout(60000)
  await installFetchWrapper(page)

  await enterChatFromHome(page)
  await expect(sendBtn(page)).toBeEnabled()

  await page.clock.install()
  await setReplyMode(page, 'chunks')

  await sendMessage(page, '持续数据')
  // 30s 内每 10s 一个 chunk → 无数据计时器不断重置
  await page.clock.runFor(30_000)
  await expect(page.getByText('嘀嘀嘀')).toBeVisible()
  await expect(page.getByRole('button', { name: '重新获取回复' })).toBeHidden()

  // 第 4 个 chunk 在 40s 到达后停止喂数据（流保持打开）→ 无数据 60s（100s 处）触发超时
  await page.clock.runFor(71_000)
  await expect(page.getByRole('button', { name: '重新获取回复' })).toBeVisible()
})

test('验收3：收到部分 chunk 后连接断开且无 [DONE]：判定失败并可重试', async ({ page }) => {
  test.setTimeout(60000)
  await installFetchWrapper(page)

  await enterChatFromHome(page)
  await expect(sendBtn(page)).toBeEnabled()

  await setReplyMode(page, 'close')
  await sendMessage(page, '断开消息')
  await expect(page.getByText('部分2', { exact: true })).toBeVisible()

  // 流结束但未收到 [DONE] → onError → 进入可重试流程
  await expect(page.getByRole('button', { name: '重新获取回复' })).toBeVisible()
  await expect(page.getByText('断开消息', { exact: true })).toHaveCount(1)
})

// 验收4（收到 [DONE] 正常完成）由既有用例覆盖：
// 开场消息与"验收1+2"重试成功路径均以 [DONE] 正常结束、不出现重试按钮

test('SPA 离开 /chat：组件卸载时取消进行中的请求（signal 中止）', async ({ page }) => {
  test.setTimeout(60000)
  await installFetchWrapper(page)

  await enterChatFromHome(page)
  await expect(sendBtn(page)).toBeEnabled()

  await setReplyMode(page, 'hang')
  await sendMessage(page, '离开测试')

  // 挂起中通过 SPA 跳转离开 /chat（不刷新，组件卸载）
  await page.getByRole('button', { name: '退回岗位选择' }).click()
  await expect(page).toHaveURL(/\/select$/)

  // 卸载 → abort 信号触发（包装器在 signal 中止时记录 __aborted）
  await expect.poll(() =>
    page.evaluate(() => (window as unknown as { __aborted?: boolean }).__aborted === true)
  ).toBe(true)
})

test('开场请求挂起时 SPA 离开 /chat：卸载同样取消开场请求（StrictMode 兼容）', async ({ page }) => {
  test.setTimeout(60000)
  await installFetchWrapper(page)

  await page.goto('/')
  await page.getByRole('link', { name: '开始岗位体验' }).first().click()
  await expect(page).toHaveURL(/\/select$/)

  // 进入 /chat 前开启"开场请求挂起"模式
  await page.evaluate(() => {
    (window as unknown as { __openingMode?: string }).__openingMode = 'hang'
  })
  await page.getByRole('button', { name: '开始体验' }).first().click()
  await expect(page).toHaveURL(/\/chat$/)

  // 开场请求挂起中通过 SPA 跳转离开（不刷新）
  await page.getByRole('button', { name: '退回岗位选择' }).click()
  await expect(page).toHaveURL(/\/select$/)

  // 真卸载 → 开场请求的 signal 被中止（StrictMode 幻影卸载未误杀，真离开取消）
  await expect.poll(() =>
    page.evaluate(() => (window as unknown as { __aborted?: boolean }).__aborted === true)
  ).toBe(true)
})

test('代答请求挂起时离开 /chat：卸载取消代答请求', async ({ page }) => {
  test.setTimeout(60000)
  await installFetchWrapper(page)

  await enterChatFromHome(page)
  await expect(sendBtn(page)).toBeEnabled()

  await setReplyMode(page, 'hang')
  // 空输入连点 5 次发送 → 触发代答（快速生成）请求，挂起
  for (let i = 0; i < 5; i++) {
    await sendBtn(page).click()
  }

  // 代答请求挂起中离开
  await page.getByRole('button', { name: '退回岗位选择' }).click()
  await expect(page).toHaveURL(/\/select$/)

  await expect.poll(() =>
    page.evaluate(() => (window as unknown as { __aborted?: boolean }).__aborted === true)
  ).toBe(true)
})

test('同事求助请求挂起时离开 /chat：卸载取消求助请求', async ({ page }) => {
  test.setTimeout(60000)
  await installFetchWrapper(page)

  await enterChatFromHome(page)
  await expect(sendBtn(page)).toBeEnabled()

  await setReplyMode(page, 'hang')
  await page.locator('.colleague-btn').click()
  await page.getByPlaceholder('问问小李...').fill('帮我看看这个任务')
  await page.locator('.colleague-input-bar button').click()

  // 关闭抽屉（抽屉覆盖层会遮挡顶栏按钮），求助请求仍在挂起
  await page.locator('.colleague-close').click()

  // 求助请求挂起中离开
  await page.getByRole('button', { name: '退回岗位选择' }).click()
  await expect(page).toHaveURL(/\/select$/)

  await expect.poll(() =>
    page.evaluate(() => (window as unknown as { __aborted?: boolean }).__aborted === true)
  ).toBe(true)
})

test('评估请求挂起时离开 /chat：卸载取消评估请求且不跳兜底报告', async ({ page }) => {
  test.setTimeout(60000)
  await installFetchWrapper(page)

  // 完成 Day 1 → 每日完成页
  await page.goto('/')
  await page.getByRole('link', { name: '开始岗位体验' }).first().click()
  await expect(page).toHaveURL(/\/select$/)
  await page.getByRole('button', { name: '开始体验' }).first().click()
  await expect(page).toHaveURL(/\/chat$/)
  await skipToNextTask(page)
  await skipToNextTask(page)
  await skipAndWaitUrl(page, /\/day-complete$/)

  // 开启挂起模式后触发评估 → 评估请求挂起
  await setReplyMode(page, 'hang')
  await page.getByRole('button', { name: '生成评估报告' }).click()
  await expect(page).toHaveURL(/\/chat$/)

  // 评估挂起中离开
  await page.getByRole('button', { name: '退回岗位选择' }).click()
  await expect(page).toHaveURL(/\/select$/)

  // 评估请求被取消
  await expect.poll(() =>
    page.evaluate(() => (window as unknown as { __aborted?: boolean }).__aborted === true)
  ).toBe(true)

  // wasCancelled 守卫：不跳转兜底 /results，停留在 /select
  await page.waitForTimeout(800)
  await expect(page).toHaveURL(/\/select$/)
})
