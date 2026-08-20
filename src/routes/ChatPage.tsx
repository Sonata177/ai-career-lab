import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useChatStore } from '../store/chatStore'
import { useJobStore } from '../store/jobStore'
import { useAssessmentStore } from '../store/assessmentStore'
import { getScenario } from '../data/scenarios'
import { buildSystemPrompt } from '../prompts/systemPrompt'
import { buildAssessmentPrompt } from '../prompts/assessmentPrompt'
import { streamChatCompletion, formatMessagesForAPI } from '../services/deepseek'
import { parseAssessmentResult } from '../utils/assessmentParsing'
import { runAssessmentWithRetry } from '../utils/assessmentRetry'
import { buildAssessmentRecord } from '../utils/assessmentHistory'
import { useHistoryStore } from '../store/historyStore'
import { MessageBubble } from '../components/chat/MessageBubble'
import { ChatInput } from '../components/chat/ChatInput'
import { TimelineBar } from '../components/chat/TimelineBar'
import { TypingIndicator } from '../components/chat/TypingIndicator'
import { TaskSelector, type TaskOption } from '../components/chat/TaskSelector'
import { RoleNotification } from '../components/chat/RoleNotification'
import { IdleHint } from '../components/chat/IdleHint'
import { ColleagueDrawer, type ColleagueMessage } from '../components/chat/ColleagueDrawer'
import type { ChatMessage } from '../types/chat'
import type { ScenarioPhase } from '../types/job'
import './ChatPage.css'

const TASK_ICONS: Record<string, string> = {
  'day1-task1': '📋', 'day1-task2': '💬', 'day1-task3': '📝',
  'day2-task1': '🤝', 'day2-task2': '✍️',
  'day3-task1': '🎨', 'day3-task2': '📊',
}

function randomizePhase(phase: ScenarioPhase): ScenarioPhase {
  if (!phase.variants || phase.variants.length === 0) return phase
  const useVariant = Math.random() > 0.5
  if (!useVariant) return phase
  const variant = phase.variants[Math.floor(Math.random() * phase.variants.length)]
  return { ...phase, ...variant }
}

/** 评估请求总次数上限：首次请求 + 1 次重试 */
const MAX_ASSESSMENT_ATTEMPTS = 2

/** 构造"跳过任务"的用户消息（模块级函数，事件回调中调用，避免渲染期纯度规则误报） */
function buildSkipMessage(phase: ScenarioPhase): ChatMessage {
  return {
    id: `skip-${Date.now()}`,
    role: 'user',
    content: `[用户跳过了本轮任务：${phase.title}，未作任何回复]`,
    timestamp: Date.now(),
  }
}

/** 构造普通用户消息（模块级函数，事件回调中调用） */
function buildUserMessage(text: string): ChatMessage {
  return {
    id: `user-${Date.now()}`,
    role: 'user',
    content: text,
    timestamp: Date.now(),
  }
}

/**
 * 单次评估请求：把回调式 streamChatCompletion 包装成 Promise。
 * 注意：result 必须在函数内部累积，否则第二次请求会拼接在第一次的错误内容后面。
 */
function requestAssessmentOnce(prompt: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let result = ''
    streamChatCompletion({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 4096,
      temperature: 0.2,
      onChunk: (text) => { result += text },
      onDone: () => resolve(result),
      onError: (err) => reject(err),
    })
  })
}

export function ChatPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const selectedJob = useJobStore((s) => s.selectedJob)
  const {
    messages, currentPhaseIndex, currentDay, timeline, isLoading, isComplete,
    userMessageCount, addMessage, setLoading, setPhaseIndex,
    setTimeline, setComplete, incrementUserMessages, reset,
  } = useChatStore()
  const { setResult, setGenerating } = useAssessmentStore()

  const [showTaskSelector, setShowTaskSelector] = useState(false)
  const [pendingTasks, setPendingTasks] = useState<TaskOption[]>([])
  const [roleNotif, setRoleNotif] = useState({ visible: false, role: '', desc: '' })
  const [showIdleHint, setShowIdleHint] = useState(false)
  const [autoGenCount, setAutoGenCount] = useState(0)
  const [colleagueOpen, setColleagueOpen] = useState(false)
  const [colleagueMessages, setColleagueMessages] = useState<ColleagueMessage[]>([])
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const storeScenario = useJobStore((s) => s.scenarioConfig)
  // 场景配置在挂载时固定一次（原为 useRef，渲染期读取 ref 会被 react-hooks/refs 规则拦截）
  const [scenario] = useState(() => storeScenario || (selectedJob ? getScenario(selectedJob.id) : null))
  const initRef = useRef(false)
  // StrictMode 下 effect 挂载会双调用，用 ref 保证 generateNow 只触发一次评估
  const generateNowHandledRef = useRef(false)
  // 当前场景的阶段数组：逻辑侧仍用 ref（事件/effect 中读写），渲染侧用 state
  const [activePhases, setActivePhases] = useState<ScenarioPhase[]>([])
  const activePhasesRef = useRef<ScenarioPhase[]>([])
  const dayStartedRef = useRef(0)
  const startedPhasesRef = useRef<Set<number>>(new Set())

  // PLACEHOLDER_EFFECTS

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }
  useEffect(scrollToBottom, [messages, isLoading, showTaskSelector])

  const resetIdleTimer = () => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    // 隐藏提示的 setState 放到异步回调中，避免在 effect 内同步调用 setState
    setTimeout(() => setShowIdleHint(false), 0)
    idleTimerRef.current = setTimeout(() => setShowIdleHint(true), 120000)
  }

  useEffect(() => {
    if (!isLoading && !isComplete && !showTaskSelector && messages.length > 0) {
      resetIdleTimer()
    }
    return () => { if (idleTimerRef.current) clearTimeout(idleTimerRef.current) }
  }, [isLoading, isComplete, showTaskSelector, messages.length])

  // PLACEHOLDER_FUNCTIONS

  const showRoleNotification = (phase: ScenarioPhase) => {
    setRoleNotif({ visible: true, role: phase.role, desc: phase.roleDescription })
  }

  const sendAIMessage = useCallback(async (phaseIndex: number, extraMessages: ChatMessage[]) => {
    if (!scenario || !activePhasesRef.current.length) return
    const phase = activePhasesRef.current[phaseIndex]
    if (!phase) return
    const systemPrompt = buildSystemPrompt(scenario, phase)
    const currentMessages = useChatStore.getState().messages
    const allMessages = [...currentMessages, ...extraMessages]

    // Only send messages from the current phase (after the last system transition message)
    const lastSysIndex = allMessages.map((m, i) => ({ m, i }))
      .filter(({ m }) => m.role === 'system' && m.content.startsWith('⏰'))
      .pop()?.i ?? 0
    const phaseMessages = allMessages.slice(lastSysIndex + 1)

    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...formatMessagesForAPI(phaseMessages.filter((m) => m.role !== 'system')),
    ]

    setLoading(true)
    let content = ''
    const msgId = `ai-${Date.now()}`
    let added = false

    await streamChatCompletion({
      messages: apiMessages,
      onChunk: (text) => {
        content += text
        if (!added) {
          added = true
          addMessage({
            id: msgId, role: 'assistant', content,
            timestamp: Date.now(), scenarioRole: phase.role,
          })
        } else {
          useChatStore.setState((state) => ({
            messages: state.messages.map((m) =>
              m.id === msgId ? { ...m, content } : m
            ),
          }))
        }
      },
      onDone: () => setLoading(false),
      onError: (err) => {
        console.error('Chat error:', err)
        setLoading(false)
        addMessage({ id: `err-${Date.now()}`, role: 'system', content: '网络错误，请重试。', timestamp: Date.now() })
      },
    })
  }, [scenario, addMessage, setLoading])

  const startPhase = useCallback((phaseIndex: number) => {
    if (!activePhasesRef.current.length) return
    const phase = activePhasesRef.current[phaseIndex]
    if (!phase) return
    if (startedPhasesRef.current.has(phaseIndex)) return
    startedPhasesRef.current.add(phaseIndex)
    addMessage({
      id: `sys-${Date.now()}`,
      role: 'system',
      content: `⏰ ${phase.time} — ${phase.title}`,
      timestamp: Date.now(),
    })
    sendAIMessage(phaseIndex, [])
  }, [addMessage, sendAIMessage])

  // PLACEHOLDER_HANDLERS

  const getDayPhases = () => activePhasesRef.current.filter((p) => p.day === currentDay)
  const getCurrentDayPhaseIndex = () => {
    const dayPhases = getDayPhases()
    const globalFirst = activePhasesRef.current.indexOf(dayPhases[0])
    return currentPhaseIndex - globalFirst
  }

  const handleSkipPhase = () => {
    const phase = activePhasesRef.current[currentPhaseIndex]
    if (phase) {
      addMessage(buildSkipMessage(phase))
    }
    showNextTaskOptions()
  }

  const showNextTaskOptions = () => {
    const dayPhases = getDayPhases()
    const localIndex = getCurrentDayPhaseIndex()
    const remaining = dayPhases.slice(localIndex + 1)
    if (remaining.length === 0) {
      if (currentDay >= 3) {
        setComplete()
        generateAssessment()
      } else {
        navigate('/day-complete')
      }
      return
    }
    const tasks: TaskOption[] = remaining.map((p) => ({
      id: p.id, title: p.title, description: p.description,
      role: p.role, icon: TASK_ICONS[p.id] || '📌',
    }))
    setPendingTasks(tasks)
    setShowTaskSelector(true)
  }

  const handleTaskSelect = (task: TaskOption) => {
    setShowTaskSelector(false)
    setPendingTasks([])
    const idx = activePhasesRef.current.findIndex((p) => p.id === task.id)
    if (idx === -1) return
    setPhaseIndex(idx)
    const phase = activePhasesRef.current[idx]
    showRoleNotification(phase)
    startPhase(idx)
  }

  const handleSend = async (text: string) => {
    if (!scenario || isComplete || showTaskSelector) return
    resetIdleTimer()
    const userMsg = buildUserMessage(text)
    addMessage(userMsg)
    incrementUserMessages()

    const phase = activePhasesRef.current[currentPhaseIndex]
    if (!phase) return
    const newCount = userMessageCount + 1

    if (newCount >= phase.messageThreshold) {
      await sendAIMessage(currentPhaseIndex, [userMsg])
      showNextTaskOptions()
    } else {
      await sendAIMessage(currentPhaseIndex, [userMsg])
    }
  }

  const handleAutoGenerate = async () => {
    if (!scenario || isLoading || isComplete || showTaskSelector) return
    setAutoGenCount((c) => c + 1)
    const phase = activePhasesRef.current[currentPhaseIndex]
    if (!phase) return

    const currentMessages = useChatStore.getState().messages
    const lastSysIndex = currentMessages.map((m, i) => ({ m, i }))
      .filter(({ m }) => m.role === 'system' && m.content.startsWith('⏰'))
      .pop()?.i ?? 0
    const phaseMessages = currentMessages.slice(lastSysIndex + 1)

    const genPrompt = `你是一个正在参加"${scenario.jobTitle}"岗位体验的优秀实习生。当前场景是"${phase.title} - ${phase.description}"。

根据以下对话上下文，请以实习生身份生成一条高质量的回复，要求：
- 表达清晰有条理，展现结构化思维
- 体现数据意识和量化思维
- 展现用户同理心和换位思考
- 有具体的行动方案和执行步骤
- 语气自然专业，像一个认真负责的实习生

对话上下文：
${phaseMessages.filter(m => m.role !== 'system').map(m => `[${m.role === 'user' ? '实习生' : phase.role}]: ${m.content}`).join('\n')}

请直接输出实习生的回复内容，不要加任何前缀或解释。`

    setLoading(true)
    let generatedText = ''

    await streamChatCompletion({
      messages: [{ role: 'user', content: genPrompt }],
      onChunk: (text) => { generatedText += text },
      onDone: () => {
        setLoading(false)
        if (generatedText.trim()) {
          handleSend(generatedText.trim())
        }
      },
      onError: () => setLoading(false),
    })
  }

  const generateAssessment = useCallback(async () => {
    if (!scenario) return
    setGenerating(true)
    setComplete()
    const allMsgs = useChatStore.getState().messages
    const prompt = buildAssessmentPrompt(allMsgs, scenario.jobTitle, colleagueMessages)

    const finishWithFallback = () => {
      setResult({
        overallScore: 0,
        jobFitPercentage: 0,
        dimensions: [],
        strengths: [],
        improvements: [],
        suggestions: ['评估报告生成失败，可能是网络波动或服务繁忙，请返回重新体验后再试。'],
        fitAdvice: '本次评估未能完成。',
      })
      setGenerating(false)
      navigate('/results')
    }

    // 最多尝试 MAX_ASSESSMENT_ATTEMPTS 次（首次请求 + 1 次重试）。
    // 解析/校验失败会重试；请求本身失败立即终止（语义见 runAssessmentWithRetry）。
    const parsed = await runAssessmentWithRetry(
      requestAssessmentOnce,
      parseAssessmentResult,
      prompt,
      MAX_ASSESSMENT_ATTEMPTS,
      (attempt, err) => {
        if (err) {
          console.error(`[评估] 第 ${attempt} 次请求失败:`, err)
        } else {
          console.warn(`[评估] 第 ${attempt} 次解析/校验失败，${attempt < MAX_ASSESSMENT_ATTEMPTS ? '准备重试' : '已达最大尝试次数'}`)
        }
      }
    )

    if (parsed) {
      setResult(parsed)
      setGenerating(false)
      // 评估历史：仅合法结果入库（兜底报告不计入）；用 getState 避免引入订阅依赖
      useHistoryStore.getState().addRecord(
        buildAssessmentRecord({
          jobTitle: useJobStore.getState().selectedJob?.title || '岗位体验',
          result: parsed,
        })
      )
      setTimeout(() => navigate('/results'), 1500)
      return
    }

    finishWithFallback()
  }, [scenario, colleagueMessages, navigate, setComplete, setGenerating, setResult])

  // 初始化/换天 effect：声明放在其引用的函数之后（react-hooks/immutability 要求先声明后使用）
  useEffect(() => {
    if (!selectedJob || !scenario) {
      navigate('/select')
      return
    }

    const generateNow = (location.state as { generateNow?: boolean } | null)?.generateNow
    if (generateNow) {
      // StrictMode 双调用保护：避免重复触发评估（重复 API 调用 + 重复历史记录）
      if (generateNowHandledRef.current) return
      generateNowHandledRef.current = true
      generateAssessment()
      return
    }

    if (initRef.current && activePhasesRef.current.length > 0) {
      if (dayStartedRef.current === currentDay) return
      dayStartedRef.current = currentDay
      startedPhasesRef.current.clear()
      const dayPhases = activePhasesRef.current.filter((p) => p.day === currentDay)
      if (dayPhases.length > 0) {
        const firstPhaseOfDay = activePhasesRef.current.indexOf(dayPhases[0])
        setPhaseIndex(firstPhaseOfDay)
        const tl = activePhasesRef.current
          .filter((p) => p.day === currentDay)
          .map((p, i) => ({
            time: p.time,
            title: p.title,
            status: i === 0 ? 'active' as const : 'pending' as const,
          }))
        setTimeline(tl)
        showRoleNotification(dayPhases[0])
        startPhase(firstPhaseOfDay)
      }
      return
    }

    if (initRef.current) return
    initRef.current = true
    const day = useChatStore.getState().currentDay
    dayStartedRef.current = day
    startedPhasesRef.current.clear()
    reset()

    const randomized = scenario.phases.map(randomizePhase)
    activePhasesRef.current = randomized
    setActivePhases(randomized)

    const dayPhases = randomized.filter((p) => p.day === day)
    if (dayPhases.length === 0) return
    const firstPhaseOfDay = randomized.indexOf(dayPhases[0])
    setPhaseIndex(firstPhaseOfDay)
    const tl = dayPhases.map((p, i) => ({
      time: p.time,
      title: p.title,
      status: i === 0 ? 'active' as const : 'pending' as const,
    }))
    setTimeline(tl)
    showRoleNotification(dayPhases[0])
    startPhase(firstPhaseOfDay)
  }, [currentDay, generateAssessment, location.state, navigate, reset, scenario, selectedJob, setPhaseIndex, setTimeline, startPhase])

  if (!scenario) return null
  const currentPhase = activePhases[currentPhaseIndex]

  // PLACEHOLDER_RENDER

  return (
    <div className="chat-page">
      <RoleNotification
        visible={roleNotif.visible}
        role={roleNotif.role}
        description={roleNotif.desc}
        onHide={() => setRoleNotif((r) => ({ ...r, visible: false }))}
      />
      <IdleHint
        visible={showIdleHint}
        onDismiss={() => setShowIdleHint(false)}
      />
      <div className="chat-header">
        <h2>{scenario.jobTitle}的一天 · Day {currentDay}</h2>
        <span className="chat-status">
          {isComplete
            ? '体验完成，正在生成评估...'
            : `当前：${currentPhase?.title || ''}`}
        </span>
        <button
          className="chat-exit-btn"
          onClick={() => navigate('/select')}
          title="退回岗位选择页面"
        >
          <span className="chat-exit-icon">✕</span>
          <span className="chat-exit-text">退回岗位选择</span>
        </button>
      </div>
      <TimelineBar steps={timeline} />
      <div className="chat-messages">
        {messages.filter((m) => m.id).map((msg) => (
          <MessageBubble
            key={msg.id}
            role={msg.role}
            content={msg.content}
            scenarioRole={msg.scenarioRole}
          />
        ))}
        {isLoading && <TypingIndicator />}
        {showTaskSelector && (
          <TaskSelector tasks={pendingTasks} onSelect={handleTaskSelect} />
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="chat-bottom-bar">
        <ChatInput
          onSend={handleSend}
          onAutoGenerate={handleAutoGenerate}
          showQuickSend={autoGenCount >= 2}
          disabled={isLoading || isComplete || showTaskSelector}
        />
        {!isComplete && !showTaskSelector && (
          <>
            <button
              className="colleague-btn"
              onClick={() => setColleagueOpen(true)}
              disabled={isLoading}
            >
              👩‍💼 问同事
            </button>
            <button
              className="skip-btn"
              onClick={handleSkipPhase}
              disabled={isLoading}
            >
              跳过本轮
            </button>
          </>
        )}
      </div>
      <ColleagueDrawer
        open={colleagueOpen}
        onClose={() => setColleagueOpen(false)}
        phaseTitle={currentPhase?.title || ''}
        phaseDescription={currentPhase?.description || ''}
        background={scenario.background}
        messages={colleagueMessages}
        onMessagesChange={setColleagueMessages}
      />
    </div>
  )
}
