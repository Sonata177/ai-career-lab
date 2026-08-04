import { create } from 'zustand'
import type { JobRole, ScenarioConfig } from '../types/job'

interface JobState {
  selectedJob: JobRole | null
  scenarioConfig: ScenarioConfig | null
  setSelectedJob: (job: JobRole) => void
  setScenarioConfig: (config: ScenarioConfig) => void
  reset: () => void
}

export const useJobStore = create<JobState>((set) => ({
  selectedJob: null,
  scenarioConfig: null,
  setSelectedJob: (job) => set({ selectedJob: job }),
  setScenarioConfig: (config) => set({ scenarioConfig: config }),
  reset: () => set({ selectedJob: null, scenarioConfig: null }),
}))
