import type { AssessmentResult } from '../types/assessment'
import type { ChatMessage, ColleagueMessage } from '../types/chat'
import type { ScenarioConfig, ScenarioPhase } from '../types/job'

/** 体验列表项：轻量字段，后端不返回 messages/result 整包 */
export interface ExperienceListItem {
  id: string
  jobTitle: string
  completedAt: string
  overallScore: number
  jobFitPercentage: number
}

/** 体验详情：对话 + 报告（供详情/对比使用） */
export interface ExperienceDetail extends ExperienceListItem {
  finishedAt: string
  scenario: ScenarioConfig
  messages: ChatMessage[]
  colleagueMessages: ColleagueMessage[]
  result: AssessmentResult
}

/** 带 HTTP 状态码的 API 错误（调用方靠 status 区分 404 与其它失败） */
export class ExperienceApiError extends Error {
  status: number

  constructor(status: number, message?: string) {
    super(message ?? `API error: ${status}`)
    this.name = 'ExperienceApiError'
    this.status = status
  }
}

/**
 * 完整体验入库（尽力而为，不阻塞主流程）：
 * POST /api/experiences，后端在同一事务内先写 experiences 再写 assessments。
 *
 * 任何失败（后端未配置数据库、网络、校验拒绝）都会向上抛出，
 * 调用方只需 console 记录，结果页照常跳转——库挂了不能挡住用户看报告。
 */
export async function saveExperience(input: {
  jobId: string
  jobTitle: string
  scenario: ScenarioConfig
  /** 实际使用（随机化后）的阶段，而非剧本原始未随机化的 phases */
  activePhases: ScenarioPhase[]
  messages: ChatMessage[]
  colleagueMessages: ColleagueMessage[]
  result: AssessmentResult
}): Promise<void> {
  const response = await fetch('/api/experiences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    throw new ExperienceApiError(response.status)
  }
}

/** 体验列表（读库，按完成时间倒序；失败抛 ExperienceApiError） */
export async function fetchExperienceList(): Promise<ExperienceListItem[]> {
  const response = await fetch('/api/experiences')
  if (!response.ok) {
    throw new ExperienceApiError(response.status)
  }
  const data = (await response.json()) as { items: ExperienceListItem[] }
  return data.items
}

/** 体验详情（对话 + 报告）；404 时抛 ExperienceApiError(404) */
export async function fetchExperienceDetail(id: string): Promise<ExperienceDetail> {
  const response = await fetch(`/api/experiences/${encodeURIComponent(id)}`)
  if (!response.ok) {
    throw new ExperienceApiError(response.status)
  }
  return (await response.json()) as ExperienceDetail
}
