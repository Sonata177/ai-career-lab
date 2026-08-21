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
