/**
 * 运行时校验：与前端 src/utils/assessmentValidation.ts 的逻辑保持一致
 * （七维评分规则），backend 校验 POST /api/experiences 的 result 字段。
 * 校验通过返回空错误列表；不通过收集全部错误，便于排查模型返回偏差。
 */

export const ASSESSMENT_DIMENSION_NAMES = [
  '沟通表达',
  '问题拆解',
  '执行落地',
  '用户同理心',
  '数据敏感度',
  '优先级判断',
  '协作与求助',
]

function isNumberInRange(value, min, max) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== ''
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => isNonEmptyString(item))
}

function isDimension(value) {
  if (typeof value !== 'object' || value === null) return false
  return (
    isNonEmptyString(value.name) &&
    isNumberInRange(value.score, 0, 100) &&
    isNonEmptyString(value.evidence) &&
    isNonEmptyString(value.color)
  )
}

/**
 * 返回校验错误列表（为空即校验通过）。
 * 规则：顶层非空对象；overallScore/jobFitPercentage 为 0~100 数字；
 * dimensions 长度 7、名称准确不重复、每项含 name/score/evidence/color；
 * strengths/improvements/suggestions 为字符串数组；fitAdvice 为非空字符串。
 */
export function getAssessmentValidationErrors(value) {
  const errors = []

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    errors.push('顶层不是对象')
    return errors
  }

  const obj = value

  // overallScore / jobFitPercentage：0~100 数字
  for (const field of ['overallScore', 'jobFitPercentage']) {
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
    const seenNames = new Set()
    dims.forEach((d, idx) => {
      if (!isDimension(d)) {
        errors.push(`dimensions[${idx}] 结构不合法（需包含 name/score/evidence/color，score 0~100，evidence 非空）`)
        return
      }
      if (!ASSESSMENT_DIMENSION_NAMES.includes(d.name)) {
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
  for (const field of ['strengths', 'improvements', 'suggestions']) {
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
 * 通过则 value 可安全当作评估结果使用。
 * @param {unknown} value
 * @returns {value is { overallScore: number, jobFitPercentage: number }}
 */
export function isAssessmentResult(value) {
  return getAssessmentValidationErrors(value).length === 0
}
