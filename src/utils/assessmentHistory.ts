import type { AssessmentResult } from '../types/assessment'

/**
 * 评估历史记录：一次完整评估（合法结果）沉淀为一条记录。
 * 后续用于历史结果列表与多次体验的对比。
 *
 * 注意：七维评分不单独存储，统一读取 result.dimensions，
 * 避免同一份数据存两遍导致不一致。
 */
export interface AssessmentRecord {
  /** 唯一标识 */
  id: string
  /** 岗位名称（展示用） */
  jobTitle: string
  /** 完成日期（ISO 时间戳） */
  completedAt: string
  /** 总分 */
  overallScore: number
  /** 岗位适配度 */
  jobFitPercentage: number
  /** 完整评估结果（含七维评分，报告页可据此恢复查看） */
  result: AssessmentResult
}

/** 构造一条评估历史记录（纯函数，字段从结果中提取） */
export function buildAssessmentRecord(input: {
  jobTitle: string
  result: AssessmentResult
}): AssessmentRecord {
  const { jobTitle, result } = input
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    jobTitle,
    completedAt: new Date().toISOString(),
    overallScore: result.overallScore,
    jobFitPercentage: result.jobFitPercentage,
    result,
  }
}
