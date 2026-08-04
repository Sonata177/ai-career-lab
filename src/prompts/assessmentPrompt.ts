import type { ChatMessage } from '../types/chat'

interface ColleagueMsg {
  role: 'user' | 'assistant'
  content: string
}

export function buildAssessmentPrompt(
  messages: ChatMessage[],
  jobTitle: string,
  colleagueMessages?: ColleagueMsg[]
): string {
  const chatLog = messages
    .filter((m) => m.role !== 'system')
    .map((m) => `[${m.role === 'user' ? '实习生' : m.scenarioRole || 'AI'}]: ${m.content}`)
    .join('\n')

  const totalPhases = messages.filter((m) => m.role === 'system' && m.content.startsWith('⏰')).length
  const skippedCount = messages.filter((m) => m.role === 'user' && m.content.startsWith('[用户跳过了本轮任务')).length
  const skippedRatio = totalPhases > 0 ? skippedCount / totalPhases : 0

  let skipPenaltyRule = ''
  if (skippedRatio >= 1) {
    skipPenaltyRule = `
【严重警告】该用户跳过了全部${skippedCount}个任务，未做任何实质性回复。这表明用户完全没有参与体验。在这种情况下：
- 所有维度评分不得超过15分
- 综合评分(overallScore)不得超过10分
- 岗位适配度(jobFitPercentage)不得超过10
- strengths应为空数组[]
- evidence必须注明"用户未参与任何任务，无法评估"
`
  } else if (skippedRatio > 0) {
    skipPenaltyRule = `
【跳过任务惩罚规则】该用户在${totalPhases}个任务中跳过了${skippedCount}个（标记为"[用户跳过了本轮任务:...]"）。跳过的任务：
- 与该任务相关的能力维度评分不得超过30分
- 综合评分需按跳过比例大幅下调（跳过${Math.round(skippedRatio * 100)}%的任务）
- evidence中必须注明该维度"因用户跳过相关任务，缺少行为证据"
`
  }

  let colleagueSection = ''
  if (colleagueMessages && colleagueMessages.length > 0) {
    const colleagueLog = colleagueMessages
      .map((m) => `[${m.role === 'user' ? '实习生' : '同事小李'}]: ${m.content}`)
      .join('\n')
    const askCount = colleagueMessages.filter((m) => m.role === 'user').length
    colleagueSection = `

【同事求助记录】（共求助${askCount}次）
${colleagueLog}

【求助行为评估指引】
- 适度求助（1-3次）体现协作意识和判断力，属于加分项
- 完全不求助可能缺乏协作意识（但不扣分，仅作参考）
- 过度依赖求助（5次以上）可能反映独立解决问题能力不足
- 关注求助时机是否恰当、问题是否有针对性、是否能将同事建议转化为自己的行动`
  }

  return `你是一个专业的人才评估专家。请根据以下"${jobTitle}"岗位体验中的对话记录，对这位实习生进行多维度能力评估。
${skipPenaltyRule}
【对话记录】
${chatLog}
${colleagueSection}

【评估要求】
请从以下维度进行评分（0-100分），并给出评估依据：
1. 沟通表达能力 - 表达是否清晰、有条理、得体
2. 问题拆解能力 - 面对复杂问题能否分步骤思考
3. 执行落地意识 - 是否关注具体行动和结果
4. 用户同理心 - 是否能站在对方角度思考
5. 数据敏感度 - 是否有量化思维和数据意识
6. 优先级判断 - 面对多任务时能否合理安排
7. 协作与求助 - 是否懂得适时寻求帮助、能否有效利用同事建议（如无求助记录则根据任务表现推断协作意识）

【评分原则】
- 评分必须严格基于用户的实际回复内容，没有回复则无法给分
- 如果用户在某个任务中未做任何实质回复（跳过），与该任务对应的能力维度最高不超过30分
- 只有用户实际展现出优秀表现的维度才能给高分（70+）
- 不要凭空推测用户的能力，只根据实际对话表现评分

请严格按以下JSON格式返回（不要包含其他内容）：
{
  "overallScore": 75,
  "jobFitPercentage": 80,
  "dimensions": [
    {"name": "沟通表达", "score": 85, "evidence": "具体表现证据", "color": "#3b82f6"},
    {"name": "问题拆解", "score": 72, "evidence": "具体表现证据", "color": "#7c3aed"},
    {"name": "执行落地", "score": 90, "evidence": "具体表现证据", "color": "#0d9488"},
    {"name": "用户同理心", "score": 78, "evidence": "具体表现证据", "color": "#ea580c"},
    {"name": "数据敏感度", "score": 65, "evidence": "具体表现证据", "color": "#eab308"},
    {"name": "优先级判断", "score": 80, "evidence": "具体表现证据", "color": "#ec4899"},
    {"name": "协作与求助", "score": 75, "evidence": "具体表现证据", "color": "#6366f1"}
  ],
  "strengths": ["亮点1", "亮点2", "亮点3"],
  "improvements": ["改进点1", "改进点2", "改进点3"],
  "suggestions": ["建议1", "建议2", "建议3"],
  "fitAdvice": "对该岗位适配度的总结建议"
}`
}
