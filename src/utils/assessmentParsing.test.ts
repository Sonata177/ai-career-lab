import { describe, it, expect } from 'vitest'
import { parseAssessmentResult } from './assessmentParsing'
import { createValidAssessment } from '../test/assessmentFixture'

describe('parseAssessmentResult', () => {
  it('合法的纯 JSON 字符串返回结果', () => {
    const valid = createValidAssessment()
    const result = parseAssessmentResult(JSON.stringify(valid))
    expect(result).toEqual(valid)
  })

  it('Markdown 代码块包裹的合法 JSON 返回结果', () => {
    const valid = createValidAssessment()
    const raw = '```json\n' + JSON.stringify(valid) + '\n```'
    expect(parseAssessmentResult(raw)).toEqual(valid)
  })

  it('JSON 前后带说明文字时仍能提取', () => {
    const valid = createValidAssessment()
    const raw = '以下是评估结果，请查收：\n' + JSON.stringify(valid) + '\n（完）'
    expect(parseAssessmentResult(raw)).toEqual(valid)
  })

  it('空字符串返回 null', () => {
    expect(parseAssessmentResult('')).toBeNull()
    expect(parseAssessmentResult('   ')).toBeNull()
  })

  it('完全没有 JSON 对象返回 null', () => {
    expect(parseAssessmentResult('模型没有输出任何内容')).toBeNull()
    expect(parseAssessmentResult('[]')).toBeNull()
  })

  it('截断或格式错误的 JSON 返回 null', () => {
    // 截断：对象未闭合
    expect(parseAssessmentResult('{"overallScore": 78, "dimensions": [')).toBeNull()
    // 语法错误：字符串未闭合
    expect(parseAssessmentResult('{"overallScore": 78, "dimensions": }')).toBeNull()
  })

  it('JSON 语法正确但缺少 dimensions 返回 null', () => {
    const valid = createValidAssessment()
    const rest = { ...valid }
    delete (rest as { dimensions?: unknown }).dimensions
    expect(parseAssessmentResult(JSON.stringify(rest))).toBeNull()
  })

  it('维度名称为"沟通表达能力"时返回 null', () => {
    const valid = createValidAssessment()
    const mutated = {
      ...valid,
      dimensions: valid.dimensions.map((d) =>
        d.name === '沟通表达' ? { ...d, name: '沟通表达能力' } : d
      ),
    }
    expect(parseAssessmentResult(JSON.stringify(mutated))).toBeNull()
  })
})
