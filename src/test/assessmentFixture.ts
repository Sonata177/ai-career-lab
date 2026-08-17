import type { AssessmentResult, AssessmentDimension } from '../types/assessment'

/**
 * 评估结果合法对象工厂（测试共享 fixture）。
 * 每次调用都返回全新的对象，避免一个测试修改后影响其他测试。
 */
export function createValidAssessment(): AssessmentResult {
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
