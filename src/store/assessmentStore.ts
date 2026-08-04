import { create } from 'zustand'
import type { AssessmentResult } from '../types/assessment'

interface AssessmentState {
  result: AssessmentResult | null
  isGenerating: boolean
  setResult: (result: AssessmentResult) => void
  setGenerating: (generating: boolean) => void
  reset: () => void
}

export const useAssessmentStore = create<AssessmentState>((set) => ({
  result: null,
  isGenerating: false,
  setResult: (result) => set({ result }),
  setGenerating: (generating) => set({ isGenerating: generating }),
  reset: () => set({ result: null, isGenerating: false }),
}))
