/**
 * 岗位真相镜结果结构：jobTitle / summary 为非空字符串，
 * 五个列表字段（responsibilities / skills / suitable / unsuitable / risks）为字符串数组。
 */
export interface MirrorResult {
  responsibilities: string[]
  skills: string[]
  suitable: string[]
  unsuitable: string[]
  risks: string[]
  summary: string
  jobTitle: string
}

const LIST_FIELDS = ['responsibilities', 'skills', 'suitable', 'unsuitable', 'risks'] as const

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => isNonEmptyString(item))
}

/**
 * 运行时校验：检查 JSON 结构是否满足 MirrorResult 要求。
 * 只校验"能否解析 JSON"是不够的，合法 JSON 但字段缺失/类型错误
 * 会导致结果页渲染异常，必须在 setResult 前拦截。
 */
export function isMirrorResult(value: unknown): value is MirrorResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const obj = value as Record<string, unknown>
  return (
    isNonEmptyString(obj.jobTitle) &&
    isNonEmptyString(obj.summary) &&
    LIST_FIELDS.every((field) => isStringArray(obj[field]))
  )
}
