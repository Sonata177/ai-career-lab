import { describe, it, expect } from 'vitest'
import { isGeneratedScenarioConfig } from './scenarioValidation'
import type { ScenarioPhase } from '../types/job'

/** 构造单个合法阶段 */
function makePhase(id: string, day: number): ScenarioPhase {
  return {
    id,
    day,
    time: '09:00',
    role: '主管·李姐',
    roleDescription: '运营组长',
    title: '晨会任务',
    description: '接收工作任务',
    systemPrompt: '你现在扮演李姐，布置任务。',
    messageThreshold: 3,
    scoringDimensions: ['沟通表达', '执行落地'],
  }
}

/** 构造合法场景配置（默认天数分布 1×3 + 2×2 + 3×2） */
function makeConfig(phaseDays: number[] = [1, 1, 1, 2, 2, 3, 3]) {
  return {
    jobId: 'custom-test',
    jobTitle: '运营实习生',
    background: '互联网教育公司用户运营部门',
    userIdentity: '入职第二周的实习生',
    phases: phaseDays.map((day, i) => makePhase(`p${i + 1}`, day)),
  }
}

describe('isGeneratedScenarioConfig', () => {
  it('完整合法对象返回 true（7 阶段，3/2/2 分布）', () => {
    expect(isGeneratedScenarioConfig(makeConfig())).toBe(true)
  })

  it('缺少 jobId 仍返回 true（jobId 由页面复制对象时覆盖，模型不可信）', () => {
    const config = makeConfig()
    const rest = { ...config }
    delete (rest as { jobId?: unknown }).jobId
    expect(isGeneratedScenarioConfig(rest)).toBe(true)
  })

  it('顶层不是对象（null / 数组 / 字符串）返回 false', () => {
    expect(isGeneratedScenarioConfig(null)).toBe(false)
    expect(isGeneratedScenarioConfig([])).toBe(false)
    expect(isGeneratedScenarioConfig('text')).toBe(false)
  })

  it('缺少 jobTitle 返回 false', () => {
    const config = makeConfig()
    const rest = { ...config }
    delete (rest as { jobTitle?: unknown }).jobTitle
    expect(isGeneratedScenarioConfig(rest)).toBe(false)
  })

  it('background 为空字符串返回 false', () => {
    expect(isGeneratedScenarioConfig({ ...makeConfig(), background: '   ' })).toBe(false)
  })

  it('缺少 userIdentity 返回 false', () => {
    const config = makeConfig()
    const rest = { ...config }
    delete (rest as { userIdentity?: unknown }).userIdentity
    expect(isGeneratedScenarioConfig(rest)).toBe(false)
  })

  it('phases 长度不为 7 返回 false（6 个 / 8 个）', () => {
    expect(isGeneratedScenarioConfig(makeConfig([1, 1, 1, 2, 2, 3]))).toBe(false)
    expect(isGeneratedScenarioConfig(makeConfig([1, 1, 1, 2, 2, 3, 3, 1]))).toBe(false)
  })

  it('phase 缺少 title 返回 false', () => {
    const config = makeConfig()
    const phases = config.phases.map((p, i) =>
      i === 0 ? { ...p, title: '' } : p
    )
    expect(isGeneratedScenarioConfig({ ...config, phases })).toBe(false)
  })

  it('phase 的 day 只能是 1|2|3（day=4 返回 false）', () => {
    const config = makeConfig()
    const phases = config.phases.map((p, i) =>
      i === 0 ? { ...p, day: 4 } : p
    )
    expect(isGeneratedScenarioConfig({ ...config, phases })).toBe(false)
  })

  it('messageThreshold 必须是正整数（0 / -1 / 1.5 / "3" 均返回 false）', () => {
    for (const bad of [0, -1, 1.5, '3'] as const) {
      const config = makeConfig()
      const phases = config.phases.map((p, i) =>
        i === 0 ? { ...p, messageThreshold: bad } as ScenarioPhase : p
      )
      expect(isGeneratedScenarioConfig({ ...config, phases })).toBe(false)
    }
  })

  it('scoringDimensions 必须是非空字符串数组（空数组 / 含数字 返回 false）', () => {
    const empty = makeConfig()
    empty.phases = empty.phases.map((p, i) =>
      i === 0 ? { ...p, scoringDimensions: [] } : p
    )
    expect(isGeneratedScenarioConfig(empty)).toBe(false)

    const withNumber = makeConfig()
    withNumber.phases = withNumber.phases.map((p, i) =>
      i === 0 ? { ...p, scoringDimensions: ['沟通表达', 123] } as ScenarioPhase : p
    )
    expect(isGeneratedScenarioConfig(withNumber)).toBe(false)
  })

  it('phase id 重复返回 false', () => {
    const config = makeConfig()
    const phases = config.phases.map((p, i) =>
      i === 6 ? { ...p, id: 'p1' } : p
    )
    expect(isGeneratedScenarioConfig({ ...config, phases })).toBe(false)
  })

  it('天数分布错误（2/2/3 替代 3/2/2）返回 false', () => {
    expect(isGeneratedScenarioConfig(makeConfig([1, 1, 2, 2, 2, 3, 3]))).toBe(false)
  })
})
