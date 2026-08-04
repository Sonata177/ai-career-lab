export interface JobRole {
  id: string
  title: string
  subtitle: string
  description: string
  icon: string
  color: string
  tags: string[]
  category: string
}

export interface ScenarioPhaseVariant {
  systemPrompt: string
  title: string
  description: string
}

export interface ScenarioPhase {
  id: string
  day: number
  time: string
  role: string
  roleDescription: string
  title: string
  description: string
  systemPrompt: string
  messageThreshold: number
  scoringDimensions: string[]
  variants?: ScenarioPhaseVariant[]
}

export interface ScenarioConfig {
  jobId: string
  jobTitle: string
  background: string
  userIdentity: string
  phases: ScenarioPhase[]
}
