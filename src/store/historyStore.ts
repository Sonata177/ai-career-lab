import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { AssessmentRecord } from '../utils/assessmentHistory'

interface HistoryState {
  records: AssessmentRecord[]
  addRecord: (record: AssessmentRecord) => void
  clear: () => void
}

/**
 * 评估历史记录 store：只保存合法评估结果（兜底报告不入库）。
 * localStorage 持久化：刷新与关闭标签页后都保留（历史记录跨会话存在）。
 */
export const useHistoryStore = create<HistoryState>()(
  persist(
    (set) => ({
      records: [],
      // 新记录放最前，历史列表直接按时间倒序展示
      addRecord: (record) =>
        set((state) => ({ records: [record, ...state.records] })),
      clear: () => set({ records: [] }),
    }),
    {
      name: 'assessment-history-store',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ records: state.records }),
    }
  )
)
