import type { ScenarioConfig } from '../../types/job'
import { operationsInternScenario } from './operations-intern'
import { salesRepScenario } from './sales-representative'
import { financeAnalystScenario } from './finance-analyst'
import { contentEditorScenario } from './content-editor'

const scenarios: Record<string, ScenarioConfig> = {
  'operations-intern': operationsInternScenario,
  'sales-representative': salesRepScenario,
  'finance-analyst': financeAnalystScenario,
  'content-editor': contentEditorScenario,
}

export function getScenario(jobId: string): ScenarioConfig | null {
  return scenarios[jobId] || null
}
