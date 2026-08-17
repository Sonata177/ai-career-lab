import { isAssessmentResult } from './assessmentValidation'
import type { AssessmentResult } from '../types/assessment'

/**
 * 纯函数：从模型原始输出中提取并校验评估结果。
 *
 * 约定：
 * - 不操作 Zustand、不导航、不控制 Loading —— 只负责"输入字符串 -> 结果或 null"
 * - 不打印日志 —— 解析/校验失败的详情由调用方决定如何记录
 *
 * 流程：提取 JSON 片段 -> JSON.parse 为 unknown -> isAssessmentResult 运行时校验
 * 成功返回 AssessmentResult；解析失败、未找到 JSON、校验失败一律返回 null。
 */
export function parseAssessmentResult(raw: string): AssessmentResult | null {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null
    const parsed: unknown = JSON.parse(jsonMatch[0])
    if (isAssessmentResult(parsed)) return parsed
    return null
  } catch {
    return null
  }
}
