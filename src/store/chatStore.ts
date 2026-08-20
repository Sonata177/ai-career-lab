import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { ChatMessage, TimelineStep } from '../types/chat'

interface ChatState {
  messages: ChatMessage[]
  currentPhaseIndex: number
  currentDay: number
  timeline: TimelineStep[]
  isLoading: boolean
  isComplete: boolean
  userMessageCount: number
  addMessage: (msg: ChatMessage) => void
  setLoading: (loading: boolean) => void
  advancePhase: () => void
  setPhaseIndex: (index: number) => void
  setTimeline: (timeline: TimelineStep[]) => void
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
      setComplete: () => set({ isComplete: true }),
      setCurrentDay: (day) => set({ currentDay: day }),
      incrementUserMessages: () =>
        set((state) => ({ userMessageCount: state.userMessageCount + 1 })),
      reset: () =>
        set({
          messages: [],
          currentPhaseIndex: 0,
          timeline: [],
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
      // 只持久化 currentDay（报告页判断"继续体验 Day N"用）；
      // 消息/时间轴/加载态等瞬时状态刷新后应恢复初始值
      partialize: (state) => ({ currentDay: state.currentDay }),
    }
  )
)
