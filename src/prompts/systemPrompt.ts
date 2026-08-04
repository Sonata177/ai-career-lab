import type { ScenarioConfig, ScenarioPhase } from '../types/job'

export function buildSystemPrompt(
  config: ScenarioConfig,
  phase: ScenarioPhase
): string {
  return `${phase.systemPrompt}

【背景信息】
${config.background}

【实习生身份】
${config.userIdentity}

【当前时间】${phase.time}
【当前场景】${phase.title} - ${phase.description}

【重要规则】
- 你只能扮演"${phase.role}"这个角色，不能跳出角色
- 不要替用户做决定或直接给出答案
- 保持对话自然流畅，像真实职场沟通
- 用中文回复，语气符合角色设定`
}
