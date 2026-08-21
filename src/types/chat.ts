export interface ChatMessage {
  id: string
  role: 'system' | 'assistant' | 'user'
  content: string
  timestamp: number
  scenarioRole?: string
}

export interface TimelineStep {
  time: string
  title: string
  status: 'pending' | 'active' | 'completed'
}

export type ChatPhase = 'intro' | 'task' | 'interaction' | 'wrap-up' | 'completed'

/** 同事求助（小李）消息 */
export interface ColleagueMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

/**
 * AI 回复请求状态（持久化）：
 * - pending：请求进行中（刷新后仍为 pending 说明请求被中断）
 * - retryable：报错或刷新中断，可一键重试
 */
export interface ReplyRequest {
  /** 重试时用原阶段重新发起请求 */
  phaseIndex: number
  /** 首个 chunk 已写入的 assistant 消息 id（重试前删除残缺消息） */
  assistantMessageId: string | null
  status: 'pending' | 'retryable'
}
