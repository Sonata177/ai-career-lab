import { describe, it, expect } from 'vitest'
import { buildAssessmentRecord, type AssessmentRecord } from './assessmentHistory'
import { createValidAssessment } from '../test/assessmentFixture'

describe('buildAssessmentRecord', () => {
  it('从评估结果提取岗位/总分/适配度并保存完整结果（七维评分以 result.dimensions 为准）', () => {
    const result = createValidAssessment()
    const record = buildAssessmentRecord({ jobTitle: '运营实习生的一天', result })

    expect(record.jobTitle).toBe('运营实习生的一天')
    expect(record.overallScore).toBe(result.overallScore)
    expect(record.jobFitPercentage).toBe(result.jobFitPercentage)
    // 不重复存储七维数据：统一从 result.dimensions 读取
    expect(record.result).toEqual(result)
    expect(record.result.dimensions).toHaveLength(7)
    expect(record.result.dimensions[0]).toEqual(result.dimensions[0])
    // 记录顶层不应再携带重复的 dimensions 字段
    expect('dimensions' in record).toBe(false)
  })

  it('每次调用生成唯一的 id 与完成时间', () => {
    const result = createValidAssessment()
    const r1 = buildAssessmentRecord({ jobTitle: 'A', result })
    const r2 = buildAssessmentRecord({ jobTitle: 'A', result })

    expect(r1.id).not.toBe(r2.id)
    expect(r1.completedAt).toBeTruthy()
    expect(r2.completedAt).toBeTruthy()
    // 都是合法 ISO 时间
    expect(Number.isNaN(Date.parse(r1.completedAt))).toBe(false)
    expect(Number.isNaN(Date.parse(r2.completedAt))).toBe(false)
  })

  it('记录的 id 字段可用于列表 key（稳定字符串）', () => {
    const record: AssessmentRecord = buildAssessmentRecord({
      jobTitle: 'X',
      result: createValidAssessment(),
    })
    expect(typeof record.id).toBe('string')
    expect(record.id.length).toBeGreaterThan(0)
  })
})
