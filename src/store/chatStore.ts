import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { ChatMessage, TimelineStep, ColleagueMessage } from '../types/chat'
import type { ScenarioPhase } from '../types/job'

interface ChatState {
  messages: ChatMessage[]
  currentPhaseIndex: number
  currentDay: number
  timeline: TimelineStep[]
  activePhases: ScenarioPhase[]
  /** 当前会话所属岗位 id（用于判断刷新后会话是否可恢复） */
  sessionJobId: string | null
  /** 任务选择器是否打开（持久化，刷新后恢复选择器状态） */
  isSelectingTask: boolean
  /** 是否正在等待 AI 回复（持久化；刷新后仍为 true 说明请求被中断） */
  isAwaitingReply: boolean
  /** 同事求助（小李）消息记录（进入评估 Prompt，需持久化） */
  colleagueMessages: ColleagueMessage[]
  isLoading: boolean
  isComplete: boolean
  userMessageCount: number
  addMessage: (msg: ChatMessage) => void
  setLoading: (loading: boolean) => void
  advancePhase: () => void
  setPhaseIndex: (index: number) => void
  setTimeline: (timeline: TimelineStep[]) => void
  setActivePhases: (phases: ScenarioPhase[]) => void
  setSessionJobId: (jobId: string) => void
  setSelectingTask: (selecting: boolean) => void
  setAwaitingReply: (awaiting: boolean) => void
  setColleagueMessages: (msgs: ColleagueMessage[]) => void
  setComplete: () => void
  setCurrentDay: (day: number) => void
  incrementUserMessages: () => void
  reset: () => void
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      messages: [],
      currentPhaseIndex: 0,
      currentDay: 1,
      timeline: [],
      activePhases: [],
      sessionJobId: null,
      isSelectingTask: false,
      isAwaitingReply: false,
      colleagueMessages: [],
      isLoading: false,
      isComplete: false,
      userMessageCount: 0,
      addMessage: (msg) =>
        set((state) => ({ messages: [...state.messages, msg] })),
      setLoading: (loading) => set({ isLoading: loading }),
      advancePhase: () =>
        set((state) => {
          const newIndex = state.currentPhaseIndex + 1
          const newTimeline = state.timeline.map((step, i) => ({
            ...step,
            status: i < newIndex ? 'completed' as const
              : i === newIndex ? 'active' as const
              : 'pending' as const,
          }))
          return {
            currentPhaseIndex: newIndex,
            timeline: newTimeline,
            userMessageCount: 0,
          }
        }),
      setPhaseIndex: (index) =>
        set((state) => ({
          currentPhaseIndex: index,
          timeline: state.timeline.map((step, i) => ({
            ...step,
            status: i < index ? 'completed' as const
              : i === index ? 'active' as const
              : 'pending' as const,
          })),
          userMessageCount: 0,
        })),
      setTimeline: (timeline) => set({ timeline }),
      setActivePhases: (phases) => set({ activePhases: phases }),
      setSessionJobId: (jobId) => set({ sessionJobId: jobId }),
      setSelectingTask: (selecting) => set({ isSelectingTask: selecting }),
      setAwaitingReply: (awaiting) => set({ isAwaitingReply: awaiting }),
      setColleagueMessages: (msgs) => set({ colleagueMessages: msgs }),
      setComplete: () => set({ isComplete: true }),
      setCurrentDay: (day) => set({ currentDay: day }),
      incrementUserMessages: () =>
        set((state) => ({ userMessageCount: state.userMessageCount + 1 })),
      reset: () =>
        set({
          messages: [],
          currentPhaseIndex: 0,
          timeline: [],
          activePhases: [],       // 清除会话阶段，避免换岗后复用旧岗位题目
          sessionJobId: null,     // 清除会话归属，强制下次全新初始化
          isSelectingTask: false,
          isAwaitingReply: false,
          colleagueMessages: [],
          isLoading: false,
          isComplete: false,
          userMessageCount: 0,
        }),
    }),
    {
      name: 'chat-store',
      version: 1,
      // sessionStorage：刷新保留、关闭标签页清除
      storage: createJSONStorage(() => sessionStorage),
      // 持久化会话进度；isLoading 是瞬时状态（刷新后旧的 API 请求已不存在，
      // 若恢复成 true 输入框会永久禁用），故不持久化
      partialize: (state) => ({
        messages: state.messages,
        currentPhaseIndex: state.currentPhaseIndex,
        currentDay: state.currentDay,
        timeline: state.timeline,
        isComplete: state.isComplete,
        userMessageCount: state.userMessageCount,
        activePhases: state.activePhases,
        sessionJobId: state.sessionJobId,
        isSelectingTask: state.isSelectingTask,
        isAwaitingReply: state.isAwaitingReply,
        colleagueMessages: state.colleagueMessages,
      }),
    }
  )
)
