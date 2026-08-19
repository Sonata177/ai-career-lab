import { test, expect } from '@playwright/test'

/** 岗位真相镜固定返回结果（MirrorResult 结构） */
const MIRROR_RESULT = {
  jobTitle: '运营专员',
  responsibilities: ['维护社群日常运营', '策划并执行用户活动', '整理运营数据日报'],
  skills: ['数据分析能力', '用户洞察力', '多任务协调能力'],
  suitable: ['喜欢与人打交道的人', '抗压能力强的人'],
  unsuitable: ['讨厌重复性工作的人'],
  risks: ['JD未提及加班频率，需在面试中确认', '绩效考核指标不透明'],
  summary: '本质上是用户运营+活动执行的综合性岗位',
}

/** 镜像页 SSE：单条 data 行携带完整 JSON */
const MIRROR_SSE = 'data: ' + JSON.stringify({
  choices: [{ delta: { content: JSON.stringify(MIRROR_RESULT) } }],
}) + '\n\ndata: [DONE]\n\n'

test('输入 JD 并点击分析：展示岗位职责、技能、风险与适合人群', async ({ page }) => {
  test.setTimeout(60000)

  let apiRequestCount = 0
  await page.route('**/api/chat/completions', async (route) => {
    apiRequestCount++
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: MIRROR_SSE,
    })
  })

  // 1. 从首页进入岗位真相镜（首页有两个同文案链接：hero 区与 features 区，取第一个）
  await page.goto('/')
  await page.getByRole('link', { name: '开始分析岗位' }).first().click()
  await expect(page).toHaveURL(/\/mirror$/)

  // 2. 输入一段 JD（措辞避开结果条目，防止文本撞车导致 strict mode violation）
  await page.getByPlaceholder(/在这里粘贴完整的岗位描述/).fill(
    '岗位职责：负责公司产品的日常运营，策划用户活动。任职要求：本科及以上学历，具备数据敏感度和执行力。'
  )

  // 3. 点击分析按钮
  await page.getByRole('button', { name: /开始解析岗位/ }).click()

  // 4/5. 结果展示：核心区块标题 + 代表性条目
  await expect(page.getByText('岗位本质', { exact: true })).toBeVisible()
  await expect(page.getByText(MIRROR_RESULT.summary)).toBeVisible()

  // 岗位职责
  await expect(page.getByText('真实工作内容')).toBeVisible()
  await expect(page.getByText('维护社群日常运营', { exact: true })).toBeVisible()

  // 技能要求
  await expect(page.getByText('核心能力要求')).toBeVisible()
  await expect(page.getByText('数据分析能力', { exact: true })).toBeVisible()

  // 适合人群
  await expect(page.getByText('适合人群', { exact: true })).toBeVisible()
  await expect(page.getByText('喜欢与人打交道的人', { exact: true })).toBeVisible()

  // 风险/注意事项
  await expect(page.getByText('风险提示与认知纠偏')).toBeVisible()
  await expect(page.getByText('JD未提及加班频率，需在面试中确认', { exact: true })).toBeVisible()

  // 恰好 1 次 API 请求
  expect(apiRequestCount).toBe(1)
})

test('JD 为空：分析按钮禁用、不发 API 请求、显示输入提示', async ({ page }) => {
  let apiRequestCount = 0
  await page.route('**/api/chat/completions', async (route) => {
    apiRequestCount++
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: MIRROR_SSE,
    })
  })

  await page.goto('/mirror')

  // 输入提示（placeholder）可见
  const jdInput = page.getByPlaceholder(/在这里粘贴完整的岗位描述/)
  await expect(jdInput).toBeVisible()

  // 空 JD 时分析按钮禁用
  const analyzeBtn = page.getByRole('button', { name: /开始解析岗位/ })
  await expect(analyzeBtn).toBeDisabled()

  // 强制点击也不会触发请求（disabled 按钮不执行 onClick）
  await analyzeBtn.click({ force: true })
  expect(apiRequestCount).toBe(0)
})

test('分析请求返回 500：显示网络错误提示，加载结束、按钮恢复可用', async ({ page }) => {
  test.setTimeout(60000)

  await page.route('**/api/chat/completions', async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'AI service error' }),
    })
  })

  await page.goto('/mirror')
  await page.getByPlaceholder(/在这里粘贴完整的岗位描述/).fill(
    '岗位职责：负责公司产品的日常运营。任职要求：本科及以上学历。'
  )
  const analyzeBtn = page.getByRole('button', { name: /开始解析岗位/ })
  await analyzeBtn.click()

  // 网络错误提示可见
  await expect(page.getByText('网络异常，请稍后重试')).toBeVisible()

  // 加载状态结束：按钮恢复为"开始解析岗位"且可用
  await expect(analyzeBtn).toBeEnabled()
  await expect(page.getByText('正在解析...')).toBeHidden()
})

test('分析返回 200 + 非法 JSON：显示格式错误提示，加载结束、按钮恢复可用', async ({ page }) => {
  test.setTimeout(60000)

  // 非法内容：HTTP 200 + 纯文本（无 JSON 对象）
  const INVALID_SSE = [
    'data: {"choices":[{"delta":{"content":"抱歉，我无法分析这个岗位。"}}]}\n\n',
    'data: [DONE]\n\n',
  ].join('')
  await page.route('**/api/chat/completions', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: INVALID_SSE,
    })
  })

  await page.goto('/mirror')
  await page.getByPlaceholder(/在这里粘贴完整的岗位描述/).fill(
    '岗位职责：负责公司产品的日常运营。任职要求：本科及以上学历。'
  )
  const analyzeBtn = page.getByRole('button', { name: /开始解析岗位/ })
  await analyzeBtn.click()

  // 格式错误提示可见
  await expect(page.getByText('分析结果格式异常，请重试')).toBeVisible()

  // 加载状态结束：按钮恢复为"开始解析岗位"且可用
  await expect(analyzeBtn).toBeEnabled()
  await expect(page.getByText('正在解析...')).toBeHidden()
})

test('分析返回 200 + 合法 JSON 但字段缺失（{}）：显示格式错误提示，页面不崩溃', async ({ page }) => {
  test.setTimeout(60000)

  // {} 是合法 JSON，但缺少 jobTitle/summary 及五个列表字段 → 结构校验失败
  const EMPTY_OBJECT_SSE = 'data: ' + JSON.stringify({
    choices: [{ delta: { content: '{}' } }],
  }) + '\n\ndata: [DONE]\n\n'
  await page.route('**/api/chat/completions', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: EMPTY_OBJECT_SSE,
    })
  })

  await page.goto('/mirror')
  await page.getByPlaceholder(/在这里粘贴完整的岗位描述/).fill(
    '岗位职责：负责公司产品的日常运营。任职要求：本科及以上学历。'
  )
  const analyzeBtn = page.getByRole('button', { name: /开始解析岗位/ })
  await analyzeBtn.click()

  // 格式错误提示可见（结构校验失败，而非 JSON 解析失败）
  await expect(page.getByText('分析结果格式异常，请重试')).toBeVisible()

  // 页面不崩溃：结果区块不渲染、按钮恢复可用
  await expect(page.locator('.mirror-results')).toBeHidden()
  await expect(analyzeBtn).toBeEnabled()
  await expect(page.getByText('正在解析...')).toBeHidden()
})

test('分析成功但场景生成返回 {}：停留在岗位真相镜并显示"场景生成失败"', async ({ page }) => {
  test.setTimeout(60000)

  // 场景生成请求返回 {}（合法 JSON 但结构不满足 isGeneratedScenarioConfig）
  const EMPTY_OBJECT_SSE = 'data: ' + JSON.stringify({
    choices: [{ delta: { content: '{}' } }],
  }) + '\n\ndata: [DONE]\n\n'

  let requestCount = 0
  await page.route('**/api/chat/completions', async (route) => {
    requestCount++
    const content = (route.request().postDataJSON()?.messages?.[0]?.content as string) ?? ''
    if (content.includes('资深的职业分析师')) {
      // 第 1 次：分析请求 → 合法结果
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: MIRROR_SSE,
      })
      return
    }
    // 第 2 次：场景生成请求 → {}
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: EMPTY_OBJECT_SSE,
    })
  })

  await page.goto('/mirror')
  await page.getByPlaceholder(/在这里粘贴完整的岗位描述/).fill(
    '岗位职责：负责公司产品的日常运营。任职要求：本科及以上学历。'
  )
  await page.getByRole('button', { name: /开始解析岗位/ }).click()
  await expect(page.getByText(MIRROR_RESULT.summary)).toBeVisible()

  // 点击"开始体验「运营专员」"（summary 不匹配内置岗位 → 走场景生成接口）
  const startBtn = page.getByRole('button', { name: /开始体验「运营专员」/ })
  await startBtn.click()

  // 页面停留在岗位真相镜，显示场景生成失败
  await expect(page).toHaveURL(/\/mirror$/)
  await expect(page.getByText('场景生成失败，请重试')).toBeVisible()

  // 加载结束：按钮恢复可用
  await expect(startBtn).toBeEnabled()
  await expect(page.getByText('生成体验场景中...')).toBeHidden()

  // 恰好 2 次请求：分析 1 次 + 场景生成 1 次
  expect(requestCount).toBe(2)
})
