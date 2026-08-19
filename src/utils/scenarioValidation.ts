import type { ScenarioConfig, ScenarioPhase } from '../types/job'

/**
 * 模型生成的场景配置：不含 jobId（jobId 由页面在复制对象时覆盖为 custom-{timestamp}）。
 */
export type GeneratedScenarioConfig = Omit<ScenarioConfig, 'jobId'>

/**
 * 场景配置运行时校验（模型生成的 7 阶段体验场景）。
 *
 * 校验规则：
 * - jobTitle / background / userIdentity：非空字符串
 * - phases：恰好 7 个
 * - 每个 phase：id / time / role / roleDescription / title / description / systemPrompt
 *   均为非空字符串；day 只能是 1|2|3；messageThreshold 为正整数；
 *   scoringDimensions 为非空字符串数组
 * - 天数分布：Day 1 = 3 个，Day 2 = 2 个，Day 3 = 2 个
 * - phase id 不重复
 *
 * 注意：不校验 jobId（模型不可信，页面之后会覆盖），因此类型收窄为
 * GeneratedScenarioConfig 而非完整 ScenarioConfig。
 */

const PHASE_STRING_FIELDS = [
  'id', 'time', 'role', 'roleDescription', 'title', 'description', 'systemPrompt',
] as const

const VALID_DAYS = [1, 2, 3] as const

/** 天数分布要求：Day1=3, Day2=2, Day3=2 */
const DAY_COUNTS: Record<number, number> = { 1: 3, 2: 2, 3: 2 }

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every((item) => isNonEmptyString(item))
}

function isPhase(value: unknown): value is ScenarioPhase {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const p = value as Record<string, unknown>
  return (
    PHASE_STRING_FIELDS.every((field) => isNonEmptyString(p[field])) &&
    VALID_DAYS.includes(p.day as (typeof VALID_DAYS)[number]) &&
    isPositiveInteger(p.messageThreshold) &&
    isNonEmptyStringArray(p.scoringDimensions)
  )
}

export function isGeneratedScenarioConfig(value: unknown): value is GeneratedScenarioConfig {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const obj = value as Record<string, unknown>

  // 顶层三个非空字符串
  if (!isNonEmptyString(obj.jobTitle)) return false
  if (!isNonEmptyString(obj.background)) return false
  if (!isNonEmptyString(obj.userIdentity)) return false

  // phases：恰好 7 个且每个合法
  if (!Array.isArray(obj.phases) || obj.phases.length !== 7) return false
  if (!obj.phases.every(isPhase)) return false

  // phase id 不重复
  const ids = obj.phases.map((p) => (p as ScenarioPhase).id)
  if (new Set(ids).size !== ids.length) return false

  // 天数分布：Day1=3, Day2=2, Day3=2
  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0 }
  for (const p of obj.phases) {
    counts[(p as ScenarioPhase).day] += 1
  }
  return counts[1] === DAY_COUNTS[1]
    && counts[2] === DAY_COUNTS[2]
    && counts[3] === DAY_COUNTS[3]
}
