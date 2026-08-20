import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { JobRole, ScenarioConfig } from '../types/job'

interface JobState {
  selectedJob: JobRole | null
  scenarioConfig: ScenarioConfig | null
  setSelectedJob: (job: JobRole) => void
  setScenarioConfig: (config: ScenarioConfig) => void
  reset: () => void
}

export const useJobStore = create<JobState>()(
  persist(
    (set) => ({
      selectedJob: null,
      scenarioConfig: null,
      setSelectedJob: (job) => set({ selectedJob: job }),
      setScenarioConfig: (config) => set({ scenarioConfig: config }),
      reset: () => set({ selectedJob: null, scenarioConfig: null }),
    }),
    {
      name: 'job-store',
      version: 1,
      // sessionStorage：刷新保留、关闭标签页清除（评估/岗位数据较敏感，不用 localStorage）
      storage: createJSONStorage(() => sessionStorage),
      // 持久化岗位信息与场景配置（报告页恢复岗位名、自定义场景刷新后可继续体验）
      partialize: (state) => ({
        selectedJob: state.selectedJob,
        scenarioConfig: state.scenarioConfig,
      }),
    }
  )
)
