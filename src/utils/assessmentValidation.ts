import type { AssessmentResult, AssessmentDimension } from '../types/assessment'

/**
 * 运行时校验：AssessmentResult 接口只在 TypeScript 编译期有效，
 * 模型返回的数据经 JSON.parse() 后是 unknown/any，错误结构也会进入
 * Zustand 和结果页面。此函数在运行时验证模型返回的评估结果结构。
 *
 * 校验规则与 experiments/evaluation/eval_pipeline.py 的 validate_schema 保持一致：
 * - 顶层必须是非空对象
 * - overallScore、jobFitPercentage 是 0~100 的数字
 * - dimensions 是长度为 7 的数组，七个维度名称准确且不重复
 * - 每个维度包含 name、score、evidence、color（score 0~100，evidence 非空字符串）
 * - strengths、improvements、suggestions 都是字符串数组
 * - fitAdvice 是非空字符串
 */

export const ASSESSMENT_DIMENSION_NAMES = [
  '沟通表达',
  '问题拆解',
  '执行落地',
  '用户同理心',
  '数据敏感度',
  '优先级判断',
  '协作与求助',
] as const

function isNumberInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => isNonEmptyString(item))
}

function isDimension(value: unknown): value is AssessmentDimension {
  if (typeof value !== 'object' || value === null) return false
  const d = value as Record<string, unknown>
  return (
    isNonEmptyString(d.name) &&
    isNumberInRange(d.score, 0, 100) &&
    isNonEmptyString(d.evidence) &&
    isNonEmptyString(d.color)
  )
}

/**
 * 返回校验错误列表（为空即校验通过）。
 * 与 Python 实验脚本一样收集所有错误，便于排查模型返回的偏差。
 */
export function getAssessmentValidationErrors(value: unknown): string[] {
  const errors: string[] = []

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    errors.push('顶层不是对象')
    return errors
  }

  const obj = value as Record<string, unknown>

  // overallScore / jobFitPercentage：0~100 数字
  for (const field of ['overallScore', 'jobFitPercentage'] as const) {
    if (!(field in obj)) {
      errors.push(`缺少必要字段: ${field}`)
    } else if (!isNumberInRange(obj[field], 0, 100)) {
      errors.push(`${field} 不是 0~100 之间的数字`)
    }
  }

  // dimensions：长度 7、名称准确且不重复、字段齐全
  const dims = obj.dimensions
  if (!Array.isArray(dims)) {
    errors.push('dimensions 不是数组')
  } else {
    if (dims.length !== 7) {
      errors.push(`dimensions 长度应为 7，实际为 ${dims.length}`)
    }
    const seenNames = new Set<string>()
    dims.forEach((d, idx) => {
      if (!isDimension(d)) {
        errors.push(`dimensions[${idx}] 结构不合法（需包含 name/score/evidence/color，score 0~100，evidence 非空）`)
        return
      }
      if (!(ASSESSMENT_DIMENSION_NAMES as readonly string[]).includes(d.name)) {
        errors.push(`dimensions[${idx}].name '${d.name}' 不在预期维度列表中`)
      } else if (seenNames.has(d.name)) {
        errors.push(`dimensions[${idx}].name '${d.name}' 重复`)
      } else {
        seenNames.add(d.name)
      }
    })
    for (const name of ASSESSMENT_DIMENSION_NAMES) {
      if (!seenNames.has(name)) {
        errors.push(`缺少维度: ${name}`)
      }
    }
  }

  // strengths / improvements / suggestions：字符串数组
  for (const field of ['strengths', 'improvements', 'suggestions'] as const) {
    if (!(field in obj)) {
      errors.push(`缺少必要字段: ${field}`)
    } else if (!isStringArray(obj[field])) {
      errors.push(`${field} 不是字符串数组`)
    }
  }

  // fitAdvice：非空字符串
  if (!('fitAdvice' in obj)) {
    errors.push('缺少必要字段: fitAdvice')
  } else if (!isNonEmptyString(obj.fitAdvice)) {
    errors.push('fitAdvice 不是非空字符串')
  }

  return errors
}

/**
 * 类型守卫：通过则 value 可安全当作 AssessmentResult 使用。
 */
export function isAssessmentResult(value: unknown): value is AssessmentResult {
  return getAssessmentValidationErrors(value).length === 0
}
