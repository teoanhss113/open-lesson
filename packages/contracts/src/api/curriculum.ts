export type CurriculumRiskLevel = 'high' | 'medium' | 'low' | 'none';

export interface CurriculumRisk {
  level: CurriculumRiskLevel;
  area: string;           // e.g. "pacing", "teacher-readiness", "slide-consistency"
  description: string;
  suggestion?: string;
}

export interface CurriculumAnalysisResult {
  projectId: string;
  lessonId?: string;
  overallRisk: CurriculumRiskLevel;
  risks: CurriculumRisk[];
  suggestions: string[];
  rolloutReady: boolean;
  analyzedAt: string;
}

export interface CurriculumReviewRequest {
  projectId: string;
  lessonIds?: string[];
  includeRolloutCheck?: boolean;
}

export interface RolloutValidationResult {
  projectId: string;
  ready: boolean;
  blockers: CurriculumRisk[];   // risks that must be resolved before rollout
  warnings: CurriculumRisk[];   // risks that are flagged but non-blocking
  validatedAt: string;
  triggeredBy: 'manual' | 'status-change';
}
