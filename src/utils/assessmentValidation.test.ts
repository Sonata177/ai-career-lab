import { describe, it, expect } from 'vitest'
import { isAssessmentResult } from './assessmentValidation'
import { createValidAssessment } from '../test/assessmentFixture'
import type { AssessmentDimension } from '../types/assessment'

/** 便捷工具：构造一个维度副本（不改动工厂返回的原始对象） */
function withDimension(
  valid: ReturnType<typeof createValidAssessment>,
  name: string,
  patch: Partial<AssessmentDimension>
) {
  return {
    ...valid,
    dimensions: valid.dimensions.map((d) =>
      d.name === name ? { ...d, ...patch } : d
    ),
  }
}

describe('isAssessmentResult', () => {
  it('完整合法对象返回 true', () => {
    expect(isAssessmentResult(createValidAssessment())).toBe(true)
  })

  it('缺少 dimensions 返回 false', () => {
    const valid = createValidAssessment()
    const rest = { ...valid }
    delete (rest as { dimensions?: unknown }).dimensions
    expect(isAssessmentResult(rest)).toBe(false)
  })

  it('维度只有 6 个返回 false', () => {
    const valid = createValidAssessment()
    expect(isAssessmentResult({ ...valid, dimensions: valid.dimensions.slice(0, 6) }))
      .toBe(false)
  })

  it('维度名称写成真实失败案例"沟通表达能力"返回 false', () => {
    const valid = createValidAssessment()
    // 模型常把 "沟通表达" 写成 "沟通表达能力"
    const mutated = withDimension(valid, '沟通表达', { name: '沟通表达能力' })
    expect(isAssessmentResult(mutated)).toBe(false)
  })

  it('维度名称重复返回 false', () => {
    const valid = createValidAssessment()
    const mutated = withDimension(valid, '问题拆解', { name: '沟通表达' })
    expect(isAssessmentResult(mutated)).toBe(false)
  })

  it('分数小于 0 或大于 100 返回 false', () => {
    const valid = createValidAssessment()
    const negative = withDimension(valid, '沟通表达', { score: -1 })
    const overflow = withDimension(valid, '沟通表达', { score: 101 })
    expect(isAssessmentResult(negative)).toBe(false)
    expect(isAssessmentResult(overflow)).toBe(false)
  })

  it('score 为 NaN 或 Infinity 返回 false', () => {
    const valid = createValidAssessment()
    const nan = withDimension(valid, '沟通表达', { score: NaN })
    const inf = withDimension(valid, '沟通表达', { score: Infinity })
    expect(isAssessmentResult(nan)).toBe(false)
    expect(isAssessmentResult(inf)).toBe(false)
  })

  it('evidence 为空返回 false', () => {
    const valid = createValidAssessment()
    const emptyEvidence = withDimension(valid, '沟通表达', { evidence: '' })
    const whitespaceEvidence = withDimension(valid, '沟通表达', { evidence: '   ' })
    expect(isAssessmentResult(emptyEvidence)).toBe(false)
    expect(isAssessmentResult(whitespaceEvidence)).toBe(false)
  })

  it('fitAdvice 为空返回 false', () => {
    const valid = createValidAssessment()
    expect(isAssessmentResult({ ...valid, fitAdvice: '' })).toBe(false)
    expect(isAssessmentResult({ ...valid, fitAdvice: '   ' })).toBe(false)
  })
})
