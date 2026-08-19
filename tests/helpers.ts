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

// ================= 岗位真相镜 =================

/** 默认测试 JD（措辞避开 MIRROR_RESULT 的条目，防止文本撞车） */
export const DEFAULT_JD_TEXT = '岗位职责：负责公司产品的日常运营。任职要求：本科及以上学历。'

/** 岗位真相镜固定结果（MirrorResult 结构） */
export const MIRROR_RESULT = {
  jobTitle: '运营专员',
  responsibilities: ['维护社群日常运营', '策划并执行用户活动', '整理运营数据日报'],
  skills: ['数据分析能力', '用户洞察力', '多任务协调能力'],
  suitable: ['喜欢与人打交道的人', '抗压能力强的人'],
  unsuitable: ['讨厌重复性工作的人'],
  risks: ['JD未提及加班频率，需在面试中确认', '绩效考核指标不透明'],
  summary: '本质上是用户运营+活动执行的综合性岗位',
}

/** 构造 SSE：delta.content 为原始文本（不序列化，用于模拟非法 JSON 等场景） */
export function rawSse(content: string): string {
  return 'data: ' + JSON.stringify({ choices: [{ delta: { content } }] }) + '\n\ndata: [DONE]\n\n'
}

/** 构造 SSE：payload 序列化后作为 delta.content */
export function mirrorSse(payload: unknown): string {
  return rawSse(JSON.stringify(payload))
}

/** 分析接口固定返回（合法七字段结果） */
export const MIRROR_SSE = mirrorSse(MIRROR_RESULT)

/** 分析接口返回 {}（合法 JSON、字段缺失 → 结构校验失败） */
export const EMPTY_OBJECT_SSE = mirrorSse({})

/** 构造合法阶段（满足 isGeneratedScenarioConfig 的 phase 要求） */
function scenarioPhase(id: string, day: number, role: string, title: string) {
  return {
    id,
    day,
    time: '09:00',
    role,
    roleDescription: '角色简介',
    title,
    description: '任务描述',
    systemPrompt: '你扮演该角色与实习生互动，每次回复控制在60字以内。',
    messageThreshold: 3,
    scoringDimensions: ['沟通表达', '执行落地'],
  }
}

/** 合法自定义场景（7 阶段，Day1×3 + Day2×2 + Day3×2；jobId 页面会覆盖） */
export const GENERATED_SCENARIO = {
  jobId: 'custom-ignore',
  jobTitle: '数据分析师',
  background: '一家互联网公司的数据分析部门',
  userIdentity: '刚入职一周的数据分析实习生',
  phases: [
    scenarioPhase('day1-task1', 1, '主管·张姐', '数据需求'),
    scenarioPhase('day1-task2', 1, '同事·小李', '数据清洗'),
    scenarioPhase('day1-task3', 1, '主管·张姐', '日报汇报'),
    scenarioPhase('day2-task1', 2, '产品·小王', '指标对齐'),
    scenarioPhase('day2-task2', 2, '客户·陈总', '需求沟通'),
    scenarioPhase('day3-task1', 3, '同事·小李', '分析报告'),
    scenarioPhase('day3-task2', 3, '主管·张姐', '总结复盘'),
  ],
}

/** 场景生成接口返回（合法七阶段配置） */
export const GENERATED_SCENARIO_SSE = mirrorSse(GENERATED_SCENARIO)

// ================= 评估结果（结果页/导航测试用） =================

/** 七个维度（名称与前端校验白名单一致） */
export const ASSESSMENT_DIMENSIONS = [
  { name: '沟通表达', score: 85 },
  { name: '问题拆解', score: 72 },
  { name: '执行落地', score: 90 },
  { name: '用户同理心', score: 78 },
  { name: '数据敏感度', score: 65 },
  { name: '优先级判断', score: 80 },
  { name: '协作与求助', score: 75 },
]

/** 合法评估结果（overallScore 78 < 80，不会触发结果页"继续体验 Day 2"） */
export const ASSESSMENT_RESULT = {
  overallScore: 78,
  jobFitPercentage: 82,
  dimensions: ASSESSMENT_DIMENSIONS.map((d) => ({
    ...d,
    evidence: '模拟评估证据。',
    color: '#3b82f6',
  })),
  strengths: ['结构化表达能力强'],
  improvements: ['数据准备不足'],
  suggestions: ['建立数据复盘习惯'],
  fitAdvice: '整体适配度较高。',
}

/** 评估接口返回（合法七维 JSON） */
export const ASSESSMENT_SSE = mirrorSse(ASSESSMENT_RESULT)

/** 在已打开的 /mirror 页面填写 JD 并点击分析，返回分析按钮定位器 */
export async function fillJdAndAnalyze(page: Page, jdText: string = DEFAULT_JD_TEXT) {
  const analyzeBtn = page.getByRole('button', { name: /开始解析岗位/ })
  await page.getByPlaceholder(/在这里粘贴完整的岗位描述/).fill(jdText)
  await analyzeBtn.click()
  return analyzeBtn
}

/** 进入岗位真相镜并分析一段 JD，返回分析按钮定位器 */
export async function analyzeJd(page: Page, jdText: string = DEFAULT_JD_TEXT) {
  await page.goto('/mirror')
  return fillJdAndAnalyze(page, jdText)
}
