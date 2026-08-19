import { useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { streamChatCompletion } from '../services/deepseek'
import { useJobStore } from '../store/jobStore'
import { useChatStore } from '../store/chatStore'
import { getScenario } from '../data/scenarios'
import { jobs } from '../data/jobs'
import { buildScenarioGenerationPrompt } from '../prompts/scenarioPrompt'
import { isMirrorResult, type MirrorResult } from '../utils/mirrorValidation'
import type { ScenarioConfig } from '../types/job'
import './JobMirrorPage.css'

const MIRROR_PROMPT = `你是一个资深的职业分析师。请对以下岗位描述（JD）进行深度解析，帮助求职者真正理解这个岗位。

请严格按以下JSON格式返回（不要包含其他内容）：
{
  "jobTitle": "岗位简称（如：课程销售、运营实习生、前端开发，不超过6个字）",
  "responsibilities": ["日常实际工作内容1", "日常实际工作内容2", "日常实际工作内容3"],
  "skills": ["真正看重的核心能力1", "核心能力2", "核心能力3"],
  "suitable": ["适合的人群特征1", "适合的人群特征2"],
  "unsuitable": ["不适合的人群特征1", "不适合的人群特征2"],
  "risks": ["需要注意的风险点或隐含信息1", "风险点2"],
  "summary": "一句话总结这个岗位的本质"
}

要求：
- responsibilities：还原真实日常工作，不要照抄JD原文，要具体化
- skills：提炼JD背后真正看重的能力，而非表面要求
- suitable/unsuitable：基于岗位节奏和工作方式判断
- risks：指出JD中模糊、美化或可能有坑的地方
- summary：用大白话说清楚这个岗位到底在干嘛

【岗位描述】
`

export function JobMirrorPage() {
  const navigate = useNavigate()
  const { setSelectedJob, setScenarioConfig } = useJobStore()
  const setCurrentDay = useChatStore((s) => s.setCurrentDay)
  const [jdText, setJdText] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [result, setResult] = useState<MirrorResult | null>(null)
  const [genError, setGenError] = useState('')
  const [analyzeError, setAnalyzeError] = useState('')

  const handleAnalyze = async () => {
    if (!jdText.trim() || isAnalyzing) return
    setIsAnalyzing(true)
    setResult(null)
    setAnalyzeError('') // 每次开始分析时清空错误
    let content = ''

    await streamChatCompletion({
      messages: [{ role: 'user', content: MIRROR_PROMPT + jdText }],
      onChunk: (text) => { content += text },
      onDone: () => {
        try {
          const jsonMatch = content.match(/\{[\s\S]*\}/)
          if (!jsonMatch) throw new Error('no json') // 没有 JSON 也要主动抛错，不能静默结束
          const parsed: unknown = JSON.parse(jsonMatch[0])
          if (!isMirrorResult(parsed)) throw new Error('invalid mirror result structure') // 先校验结构，再 setResult
          setResult(parsed)
        } catch (e) {
          console.error('Parse error:', e)
          setAnalyzeError('分析结果格式异常，请重试')
        }
        setIsAnalyzing(false)
      },
      onError: () => {
        setAnalyzeError('网络异常，请稍后重试')
        setIsAnalyzing(false)
      },
    })
  }

  const findMatchingJob = (summary: string) => {
    const keywords = summary.toLowerCase()
    for (const job of jobs) {
      const title = job.title.replace('的一天', '').toLowerCase()
      if (keywords.includes(title) || title.includes(keywords.slice(0, 4))) {
        const scenario = getScenario(job.id)
        if (scenario) return { job, scenario }
      }
    }
    return null
  }

  const handleStartExperience = async () => {
    if (!result) return

    setCurrentDay(1)
    const match = findMatchingJob(result.summary)
    if (match) {
      setSelectedJob(match.job)
      setScenarioConfig(match.scenario)
      navigate('/chat')
      return
    }

    setIsGenerating(true)
    setGenError('')
    let content = ''
    const prompt = buildScenarioGenerationPrompt(jdText)

    await streamChatCompletion({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 8192,
      onChunk: (text) => { content += text },
      onDone: () => {
        try {
          const jsonMatch = content.match(/\{[\s\S]*\}/)
          if (!jsonMatch) throw new Error('no json')
          const config: ScenarioConfig = JSON.parse(jsonMatch[0])
          config.jobId = `custom-${Date.now()}`
          setScenarioConfig(config)
          setSelectedJob({
            id: config.jobId,
            title: `${config.jobTitle}的一天`,
            subtitle: '自定义岗位体验',
            description: result.summary,
            icon: '🚀',
            color: '#6366f1',
            tags: result.skills.slice(0, 4),
            category: 'custom',
          })
          navigate('/chat')
        } catch (e) {
          console.error('Scenario generation error:', e)
          setGenError('场景生成失败，请重试')
        }
        setIsGenerating(false)
      },
      onError: () => {
        setGenError('网络异常，请重试')
        setIsGenerating(false)
      },
    })
  }

  // PLACEHOLDER_RENDER

  return (
    <div className="mirror-page">
      <div className="mirror-top-actions">
        <button
          className="close-btn"
          onClick={() => navigate('/select')}
          title="跳转到岗位体验"
        >
          <span className="close-icon">⬅</span>
          <span className="close-text">岗位体验</span>
        </button>
        <button
          className="close-btn"
          onClick={() => navigate('/')}
          title="返回首页"
        >
          <span className="close-icon">✕</span>
          <span className="close-text">返回首页</span>
        </button>
      </div>

      <div className="mirror-hero">
        <motion.div
          className="mirror-hero-content"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="mirror-hero-badge">AI 深度解析</div>
          <h1>岗位真相镜</h1>
          <p>粘贴一段岗位描述，AI 帮你看透这个岗位的真实面貌</p>
        </motion.div>
      </div>

      <div className="container">
        <motion.div
          className="mirror-input-card"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="mirror-input-header">
            <span className="mirror-input-icon">📋</span>
            <span>粘贴岗位描述（JD）</span>
          </div>
          <textarea
            className="jd-textarea"
            value={jdText}
            onChange={(e) => setJdText(e.target.value)}
            placeholder={"在这里粘贴完整的岗位描述...\n\n例如：\n岗位职责：\n1. 负责公司产品的日常运营...\n\n任职要求：\n1. 本科及以上学历..."}
            rows={10}
            disabled={isAnalyzing}
          />
          <div className="mirror-input-actions">
            <button
              className="btn-analyze"
              onClick={handleAnalyze}
              disabled={!jdText.trim() || isAnalyzing}
            >
              {isAnalyzing ? (
                <>
                  <span className="btn-spinner" />
                  正在解析...
                </>
              ) : (
                <>
                  <span>🔍</span>
                  开始解析岗位
                </>
              )}
            </button>
            {result && (
              <button
                className="btn-experience"
                onClick={handleStartExperience}
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <>
                    <span className="btn-spinner" />
                    生成体验场景中...
                  </>
                ) : (
                  <>
                    <span>🚀</span>
                    开始体验「{result.jobTitle}」
                  </>
                )}
              </button>
            )}
          </div>
          {analyzeError && (
            <div className="mirror-gen-error">{analyzeError}</div>
          )}
          {genError && (
            <div className="mirror-gen-error">{genError}</div>
          )}
        </motion.div>

        {(isAnalyzing || isGenerating) && (
          <motion.div
            className="mirror-loading-state"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <div className="loading-spinner" />
            <p>{isGenerating ? '正在为你生成沉浸式岗位体验场景...' : '正在深度解析岗位信息...'}</p>
          </motion.div>
        )}

        {result && (
          <motion.div
            className="mirror-results"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="mirror-summary-card">
              <div className="mirror-summary-badge">岗位本质</div>
              <p className="mirror-summary-text">{result.summary}</p>
            </div>

            <div className="mirror-grid">
              <motion.div
                className="mirror-card"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 }}
              >
                <div className="mirror-card-header">
                  <span className="mirror-card-icon">📋</span>
                  <h3>真实工作内容</h3>
                </div>
                <ul>
                  {result.responsibilities.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </motion.div>

              <motion.div
                className="mirror-card"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
              >
                <div className="mirror-card-header">
                  <span className="mirror-card-icon">🎯</span>
                  <h3>核心能力要求</h3>
                </div>
                <ul>
                  {result.skills.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </motion.div>

              <motion.div
                className="mirror-card suitable"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
              >
                <div className="mirror-card-header">
                  <span className="mirror-card-icon">✅</span>
                  <h3>适合人群</h3>
                </div>
                <ul>
                  {result.suitable.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </motion.div>

              <motion.div
                className="mirror-card unsuitable"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 }}
              >
                <div className="mirror-card-header">
                  <span className="mirror-card-icon">❌</span>
                  <h3>不适合人群</h3>
                </div>
                <ul>
                  {result.unsuitable.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </motion.div>
            </div>

            <motion.div
              className="mirror-card risks-card"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              <div className="mirror-card-header">
                <span className="mirror-card-icon">⚠️</span>
                <h3>风险提示与认知纠偏</h3>
              </div>
              <ul>
                {result.risks.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </motion.div>
          </motion.div>
        )}
      </div>
    </div>
  )
}
