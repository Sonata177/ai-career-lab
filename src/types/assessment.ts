export interface AssessmentDimension {
  name: string
  score: number
  evidence: string
  color: string
}

export interface AssessmentResult {
  overallScore: number
  jobFitPercentage: number
  dimensions: AssessmentDimension[]
  strengths: string[]
  improvements: string[]
  suggestions: string[]
  fitAdvice: string
}
