import type { AssessmentResult } from '../types/assessment'
import type { ChatMessage, ColleagueMessage } from '../types/chat'
import type { ScenarioConfig, ScenarioPhase } from '../types/job'

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
    throw new Error(`API error: ${response.status}`)
  }
}
