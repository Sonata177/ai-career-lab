import { describe, it, expect } from 'vitest'
import { buildAssessmentPrompt } from './assessmentPrompt'
import type { ChatMessage } from '../types/chat'

/** 构造一条阶段开始消息（system，⏰ 前缀用于统计总阶段数） */
function phaseMessage(title: string): ChatMessage {
  return {
    id: `sys-${title}`,
    role: 'system',
    content: `⏰ 09:00 — ${title}`,
    timestamp: 0,
  }
}

/** 构造一条"跳过任务"用户消息（[用户跳过了本轮任务 前缀用于统计跳过数） */
function skipMessage(title: string): ChatMessage {
  return {
    id: `skip-${title}`,
    role: 'user',
    content: `[用户跳过了本轮任务：${title}，未作任何回复]`,
    timestamp: 0,
  }
}

/** 构造一条正常用户消息 */
function normalMessage(text: string): ChatMessage {
  return {
    id: `user-${text}`,
    role: 'user',
    content: text,
    timestamp: 0,
  }
}

describe('buildAssessmentPrompt 跳过惩罚规则', () => {
  it('全部跳过：触发严重警告和全部跳过限制', () => {
    const messages = [
      phaseMessage('任务一'),
      skipMessage('任务一'),
      phaseMessage('任务二'),
      skipMessage('任务二'),
    ]

    const prompt = buildAssessmentPrompt(messages, '运营实习生')

    expect(prompt).toContain('严重警告')
    expect(prompt).toContain('不得超过10分')
    expect(prompt).toContain('strengths应为空数组')
    expect(prompt).toContain('所有维度评分不得超过15分')
    expect(prompt).toContain('岗位适配度(jobFitPercentage)不得超过10')
    expect(prompt).toContain('evidence必须注明')
  })

  it('部分跳过：包含"跳过任务惩罚规则"，但不包含"跳过了全部"', () => {
    const messages = [
      phaseMessage('任务一'),
      normalMessage('任务一我完成了。'),
      phaseMessage('任务二'),
      skipMessage('任务二'),
      phaseMessage('任务三'),
      normalMessage('任务三也完成了。'),
    ]

    const prompt = buildAssessmentPrompt(messages, '运营实习生')

    expect(prompt).toContain('跳过任务惩罚规则')
    expect(prompt).not.toContain('跳过了全部')
  })

  it('没有跳过：不包含任何跳过惩罚规则', () => {
    const messages = [
      phaseMessage('任务一'),
      normalMessage('我完成了任务一。'),
    ]

    const prompt = buildAssessmentPrompt(messages, '运营实习生')

    expect(prompt).not.toContain('严重警告')
    expect(prompt).not.toContain('跳过任务惩罚规则')
    expect(prompt).not.toContain('跳过了全部')
  })
})
