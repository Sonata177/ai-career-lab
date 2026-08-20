import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { AssessmentResult } from '../types/assessment'

interface AssessmentState {
  result: AssessmentResult | null
  isGenerating: boolean
  setResult: (result: AssessmentResult) => void
  setGenerating: (generating: boolean) => void
  reset: () => void
}

export const useAssessmentStore = create<AssessmentState>()(
  persist(
    (set) => ({
      result: null,
      isGenerating: false,
      setResult: (result) => set({ result }),
      setGenerating: (generating) => set({ isGenerating: generating }),
      reset: () => set({ result: null, isGenerating: false }),
    }),
    {
      name: 'assessment-store',
      version: 1,
      // sessionStorage：刷新页面报告不丢失，关闭标签页自动清除
      storage: createJSONStorage(() => sessionStorage),
      // 只持久化评估结果；生成中状态不持久化
      partialize: (state) => ({ result: state.result }),
    }
  )
)
