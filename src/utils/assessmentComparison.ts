import type { AssessmentResult } from '../types/assessment'
import { ASSESSMENT_DIMENSION_NAMES } from './assessmentValidation'

export type DimensionTrend = 'up' | 'down' | 'same'

/**
 * 对比所需的最小记录结构：与云端 ExperienceDetail 结构兼容，
 * 列表/详情/对比均以 Postgres 为准，本地（localStorage）历史已废弃。
 * 注意：七维评分不单独存储，统一读取 result.dimensions。
 */
export interface AssessmentRecord {
  /** 唯一标识（云端 experience id） */
  id: string
  /** 岗位名称（展示用） */
  jobTitle: string
  /** 完成日期（ISO 时间戳） */
  completedAt: string
  /** 总分 */
  overallScore: number
  /** 岗位适配度 */
  jobFitPercentage: number
  /** 完整评估结果（含七维评分） */
  result: AssessmentResult
}

export interface DimensionDiff {
  name: string
  beforeScore: number
  afterScore: number
  /** after - before */
  diff: number
  /** diff > 0 提升 / < 0 下降 / = 0 不变 */
  trend: DimensionTrend
}

export interface AssessmentComparison {
  before: {
    jobTitle: string
    completedAt: string
    overallScore: number
    jobFitPercentage: number
  }
  after: {
    jobTitle: string
    completedAt: string
    overallScore: number
    jobFitPercentage: number
  }
  overallDiff: number
  jobFitDiff: number
  /** 七个维度（按标准白名单顺序） */
  dimensions: DimensionDiff[]
}

/**
 * 对比两份评估记录。
 * 时间语义：按 completedAt 排序，较早的为 before（前次），较晚的为 after（本次）。
 * diff = after - before（正数表示提升）。
 */
export function compareAssessments(
  recordA: AssessmentRecord,
  recordB: AssessmentRecord
): AssessmentComparison {
  // 排序副本，不修改入参
  const [earlier, later] = [recordA, recordB].sort((x, y) =>
    x.completedAt.localeCompare(y.completedAt)
  )

  const beforeScores = new Map(earlier.result.dimensions.map((d) => [d.name, d.score]))
  const afterScores = new Map(later.result.dimensions.map((d) => [d.name, d.score]))

  const dimensions: DimensionDiff[] = ASSESSMENT_DIMENSION_NAMES.map((name) => {
    const beforeScore = beforeScores.get(name) ?? 0
    const afterScore = afterScores.get(name) ?? 0
    const diff = afterScore - beforeScore
    return {
      name,
      beforeScore,
      afterScore,
      diff,
      trend: diff > 0 ? 'up' : diff < 0 ? 'down' : 'same',
    }
  })

  return {
    before: {
      jobTitle: earlier.jobTitle,
      completedAt: earlier.completedAt,
      overallScore: earlier.result.overallScore,
      jobFitPercentage: earlier.result.jobFitPercentage,
    },
    after: {
      jobTitle: later.jobTitle,
      completedAt: later.completedAt,
      overallScore: later.result.overallScore,
      jobFitPercentage: later.result.jobFitPercentage,
    },
    overallDiff: later.result.overallScore - earlier.result.overallScore,
    jobFitDiff: later.result.jobFitPercentage - earlier.result.jobFitPercentage,
    dimensions,
  }
}
