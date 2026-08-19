import { describe, it, expect } from 'vitest'
import { isMirrorResult } from './mirrorValidation'

/** 合法结果工厂：每次调用返回全新对象 */
function createValidMirrorResult() {
  return {
    jobTitle: '运营专员',
    responsibilities: ['维护社群日常运营', '策划用户活动'],
    skills: ['数据分析能力', '用户洞察力'],
    suitable: ['喜欢与人打交道的人'],
    unsuitable: ['讨厌重复性工作的人'],
    risks: ['JD未提及加班频率'],
    summary: '用户运营+活动执行的综合性岗位',
  }
}

describe('isMirrorResult', () => {
  it('完整合法对象返回 true', () => {
    expect(isMirrorResult(createValidMirrorResult())).toBe(true)
  })

  it('空对象 {} 返回 false', () => {
    expect(isMirrorResult({})).toBe(false)
  })

  it('缺少 jobTitle 返回 false', () => {
    const rest = { ...createValidMirrorResult() }
    delete (rest as { jobTitle?: unknown }).jobTitle
    expect(isMirrorResult(rest)).toBe(false)
  })

  it('缺少 summary 返回 false', () => {
    const rest = { ...createValidMirrorResult() }
    delete (rest as { summary?: unknown }).summary
    expect(isMirrorResult(rest)).toBe(false)
  })

  it('jobTitle 为空字符串返回 false', () => {
    expect(isMirrorResult({ ...createValidMirrorResult(), jobTitle: '' })).toBe(false)
    expect(isMirrorResult({ ...createValidMirrorResult(), jobTitle: '   ' })).toBe(false)
  })

  it('列表字段缺失返回 false（responsibilities）', () => {
    const rest = { ...createValidMirrorResult() }
    delete (rest as { responsibilities?: unknown }).responsibilities
    expect(isMirrorResult(rest)).toBe(false)
  })

  it('列表字段不是字符串数组返回 false（skills 含数字 / risks 为字符串）', () => {
    expect(isMirrorResult({ ...createValidMirrorResult(), skills: ['分析', 123] })).toBe(false)
    expect(isMirrorResult({ ...createValidMirrorResult(), risks: '不是数组' })).toBe(false)
  })

  it('顶层不是对象（数组/字符串/null）返回 false', () => {
    expect(isMirrorResult([])).toBe(false)
    expect(isMirrorResult('text')).toBe(false)
    expect(isMirrorResult(null)).toBe(false)
  })
})
