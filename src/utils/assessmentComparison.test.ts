import { describe, it, expect } from 'vitest'
import { compareAssessments } from './assessmentComparison'
import { buildAssessmentRecord } from './assessmentHistory'
import { createValidAssessment } from '../test/assessmentFixture'
import { ASSESSMENT_DIMENSION_NAMES } from './assessmentValidation'
import type { AssessmentResult } from '../types/assessment'

/** 构造一条记录：可按 id 与完成时间定制 */
function makeRecord(id: string, completedAt: string, result: AssessmentResult) {
  const record = buildAssessmentRecord({ jobTitle: '运营实习生的一天', result })
  return { ...record, id, completedAt }
}

/** 基于合法结果修改某个维度分数与总分 */
function withScores(result: AssessmentResult, dimScores: Record<string, number>, overall: number) {
  return {
    ...result,
    overallScore: overall,
    dimensions: result.dimensions.map((d) => ({
      ...d,
      score: dimScores[d.name] ?? d.score,
    })),
  }
}

describe('compareAssessments', () => {
  it('分数全部提升：overallDiff 为正，维度趋势为 up，diff = after - before', () => {
    const before = createValidAssessment()
    const after = withScores(
      createValidAssessment(),
      { 沟通表达: 95, 问题拆解: 80 },
      88
    )
    const comparison = compareAssessments(
      makeRecord('a', '2026-08-10T00:00:00.000Z', before),
      makeRecord('b', '2026-08-12T00:00:00.000Z', after)
    )

    expect(comparison.before.jobTitle).toBe('运营实习生的一天')
    expect(comparison.overallDiff).toBe(10) // 88 - 78
    expect(comparison.dimensions).toHaveLength(7)
    expect(comparison.dimensions[0]).toEqual({
      name: '沟通表达',
      beforeScore: 85,
      afterScore: 95,
      diff: 10,
      trend: 'up',
    })
  })

  it('分数下降：趋势为 down，diff 为负', () => {
    const before = createValidAssessment()
    const after = withScores(createValidAssessment(), { 数据敏感度: 50 }, 70)
    const comparison = compareAssessments(
      makeRecord('a', '2026-08-10T00:00:00.000Z', before),
      makeRecord('b', '2026-08-12T00:00:00.000Z', after)
    )

    const dataDim = comparison.dimensions.find((d) => d.name === '数据敏感度')!
    expect(dataDim).toEqual({
      name: '数据敏感度',
      beforeScore: 65,
      afterScore: 50,
      diff: -15,
      trend: 'down',
    })
    expect(comparison.overallDiff).toBe(-8)
  })

  it('分数不变：趋势为 same，diff 为 0', () => {
    const result = createValidAssessment()
    const comparison = compareAssessments(
      makeRecord('a', '2026-08-10T00:00:00.000Z', result),
      makeRecord('b', '2026-08-12T00:00:00.000Z', createValidAssessment())
    )

    expect(comparison.overallDiff).toBe(0)
    expect(comparison.dimensions.every((d) => d.trend === 'same' && d.diff === 0)).toBe(true)
  })

  it('按完成时间排序：传入顺序无关，较早的始终为 before', () => {
    const older = createValidAssessment()
    const newer = withScores(createValidAssessment(), {}, 90)
    // 故意先传较新的
    const comparison = compareAssessments(
      makeRecord('new', '2026-08-12T00:00:00.000Z', newer),
      makeRecord('old', '2026-08-10T00:00:00.000Z', older)
    )

    expect(comparison.before.overallScore).toBe(78)
    expect(comparison.after.overallScore).toBe(90)
    expect(comparison.overallDiff).toBe(12)
  })

  it('维度顺序与标准白名单一致，共 7 项', () => {
    const comparison = compareAssessments(
      makeRecord('a', '2026-08-10T00:00:00.000Z', createValidAssessment()),
      makeRecord('b', '2026-08-12T00:00:00.000Z', createValidAssessment())
    )

    expect(comparison.dimensions.map((d) => d.name)).toEqual([...ASSESSMENT_DIMENSION_NAMES])
  })

  it('岗位适配度差值与总分差值独立计算', () => {
    const before = createValidAssessment()
    const after = {
      ...createValidAssessment(),
      overallScore: 88,
      jobFitPercentage: 95,
    }
    const comparison = compareAssessments(
      makeRecord('a', '2026-08-10T00:00:00.000Z', before),
      makeRecord('b', '2026-08-12T00:00:00.000Z', after)
    )

    expect(comparison.overallDiff).toBe(10)
    expect(comparison.jobFitDiff).toBe(13)
  })
})
