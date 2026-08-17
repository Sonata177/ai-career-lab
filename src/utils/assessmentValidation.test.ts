import { describe, it, expect } from 'vitest'
import { isAssessmentResult } from './assessmentValidation'
import type { AssessmentResult, AssessmentDimension } from '../types/assessment'

/**
 * 合法对象工厂：每个测试都重新调用，避免一个测试修改对象后影响其他测试。
 * 返回全新的深拷贝对象（每次调用都新建）。
 */
function createValidAssessment(): AssessmentResult {
  const dimensions: AssessmentDimension[] = [
    { name: '沟通表达', score: 85, evidence: '需求沟通清晰，一次对齐。', color: '#3b82f6' },
    { name: '问题拆解', score: 72, evidence: '能分步骤拆解复杂问题。', color: '#7c3aed' },
    { name: '执行落地', score: 90, evidence: '承诺必达，有明确时间节点。', color: '#0d9488' },
    { name: '用户同理心', score: 78, evidence: '能站在用户角度思考。', color: '#ea580c' },
    { name: '数据敏感度', score: 65, evidence: '具备量化思维雏形。', color: '#eab308' },
    { name: '优先级判断', score: 80, evidence: '能合理安排多任务优先级。', color: '#ec4899' },
    { name: '协作与求助', score: 75, evidence: '懂得适时寻求帮助。', color: '#6366f1' },
  ]
  return {
    overallScore: 78,
    jobFitPercentage: 82,
    dimensions,
    strengths: ['结构化表达能力强'],
    improvements: ['数据准备不足'],
    suggestions: ['建立数据复盘习惯'],
    fitAdvice: '整体适配度较高，建议录用。',
  }
}

/** 便捷工具：构造一个维度副本（不改动工厂返回的原始对象） */
function withDimension(
  valid: AssessmentResult,
  name: string,
  patch: Partial<AssessmentDimension>
): AssessmentResult {
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
    const { dimensions: _omit, ...rest } = createValidAssessment()
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
