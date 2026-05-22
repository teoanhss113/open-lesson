import type { Express, Request, Response } from 'express';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { RouteDeps } from './server-context.js';
import type {
  CurriculumRisk,
  CurriculumRiskLevel,
  CurriculumAnalysisResult,
  RolloutValidationResult,
  CurriculumStatus
} from '@open-design/contracts';

export interface RegisterCurriculumRoutesDeps extends RouteDeps<
  'db' | 'design' | 'http' | 'paths' | 'projectStore' | 'projectFiles' | 'status' | 'liveArtifacts'
> {}

export function registerCurriculumRoutes(app: Express, ctx: RegisterCurriculumRoutesDeps) {
  const { db, design } = ctx;
  const { sendApiError } = ctx.http;
  const { PROJECTS_DIR } = ctx.paths;
  const { getProject, updateProject } = ctx.projectStore;
  const { listFiles, resolveProjectDir } = ctx.projectFiles;
  const {
    listLatestProjectRunStatuses,
    listProjectsAwaitingInput,
    normalizeProjectDisplayStatus,
    composeProjectDisplayStatus,
    listProjects,
  } = ctx.status;
  const { createLiveArtifact, listLiveArtifacts, getLiveArtifact } = ctx.liveArtifacts;

  function projectStatusFromRun(run: any) {
    return {
      value: normalizeProjectDisplayStatus(run.status),
      updatedAt: run.updatedAt,
      runId: run.id,
    };
  }

  // 1. GET /api/curriculum/projects
  app.get('/api/curriculum/projects', (_req: Request, res: Response) => {
    try {
      const latestRunStatuses = listLatestProjectRunStatuses(db);
      const awaitingInputProjects = listProjectsAwaitingInput(db);
      const activeRunStatuses = new Map();

      for (const run of design.runs.list()) {
        if (!run.projectId) continue;
        const runStatus = projectStatusFromRun(run);
        if (design.runs.isTerminal(run.status)) {
          const existing = latestRunStatuses.get(run.projectId);
          if (!existing || run.updatedAt > (existing.updatedAt ?? 0)) {
            latestRunStatuses.set(run.projectId, runStatus);
          }
        } else {
          const existing = activeRunStatuses.get(run.projectId);
          if (!existing || run.updatedAt > (existing.updatedAt ?? 0)) {
            activeRunStatuses.set(run.projectId, runStatus);
          }
        }
      }

      const allProjects = listProjects(db);
      const curriculumProjects = allProjects.filter((project: any) => {
        const meta = project.metadata || {};
        return meta.curriculumKind !== undefined || meta.curriculumStatus !== undefined;
      });

      const body = {
        projects: curriculumProjects.map((project: any) => ({
          ...project,
          status: composeProjectDisplayStatus(
            activeRunStatuses.get(project.id) ??
              latestRunStatuses.get(project.id) ?? { value: 'not_started' },
            awaitingInputProjects,
            project.id,
          ),
        })),
      };

      res.json(body);
    } catch (err: any) {
      sendApiError(res, 500, 'INTERNAL_ERROR', String(err));
    }
  });

  // 2. GET /api/curriculum/projects/:id/review
  app.get('/api/curriculum/projects/:id/review', async (req: Request, res: Response) => {
    try {
      const projectId = req.params.id as string;
      const project = getProject(db, projectId);
      if (!project) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'Project not found');
      }

      const artifacts = await listLiveArtifacts({
        projectsRoot: PROJECTS_DIR,
        projectId,
      });

      const reviewArtifact = artifacts
        .filter((art: any) => art.slug === 'curriculum-review' || art.slug === 'rollout-validation')
        .sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];

      if (!reviewArtifact) {
        return res.json({ artifact: null });
      }

      const record = await getLiveArtifact({
        projectsRoot: PROJECTS_DIR,
        projectId,
        artifactId: reviewArtifact.id,
      });

      res.json({ artifact: record.artifact });
    } catch (err: any) {
      sendApiError(res, 500, 'INTERNAL_ERROR', String(err));
    }
  });

  // Helper function to scan project files and run heuristics
  async function runHeuristicsAnalysis(projectId: string, project: any): Promise<CurriculumAnalysisResult> {
    const resolvedDir = resolveProjectDir(PROJECTS_DIR, projectId, project.metadata);
    const files = await listFiles(PROJECTS_DIR, projectId, { metadata: project.metadata });

    let pacingMinutes = 0;
    let timingKeywordsFound = false;
    let activeLearningOccurrences = 0;
    let misconceptionsFound = false;
    let teacherGuidanceFound = false;
    let slideFilesCount = 0;

    let lessonPlanContent = '';
    let teachingGuideContent = '';

    for (const file of files) {
      const nameLower = file.name.toLowerCase();
      const isHtml = nameLower.endsWith('.html') || nameLower.endsWith('.htm');
      const isMarkdown = nameLower.endsWith('.md') || nameLower.endsWith('.markdown');

      if (isHtml || isMarkdown) {
        try {
          const filePath = path.join(resolvedDir, file.name);
          const content = await fs.readFile(filePath, 'utf8');

          if (nameLower.includes('lesson-plan') || nameLower.includes('lessonplan') || nameLower.includes('giáo án') || nameLower.includes('bài dạy')) {
            lessonPlanContent += ' ' + content;
          } else if (nameLower.includes('teaching-guide') || nameLower.includes('teacher-guide') || nameLower.includes('hướng dẫn')) {
            teachingGuideContent += ' ' + content;
          } else if (nameLower.includes('slide') || nameLower.includes('deck') || nameLower.includes('trình chiếu')) {
            slideFilesCount++;
          }

          // Count active learning keywords
          const activeRegex = /\b(hands-on|practice|activity|exercise|group work|discussion|thực hành|hoạt động|thảo luận|bài tập)\b/gi;
          const activeMatches = content.match(activeRegex);
          if (activeMatches) {
            activeLearningOccurrences += activeMatches.length;
          }

          // Misconceptions
          if (/\b(misconception|mistake|error|hiểu lầm|sai lầm|lỗi thường gặp)\b/i.test(content)) {
            misconceptionsFound = true;
          }

          // Teacher Guidance
          if (/\b(explanation|guidance|analogy|checkpoint|giải thích|lưu ý giáo viên)\b/i.test(content)) {
            teacherGuidanceFound = true;
          }

          // Extract timing
          const timingMatches = content.match(/(\d+)\s*(?:min|minute|phút)/gi);
          if (timingMatches) {
            timingKeywordsFound = true;
            for (const match of timingMatches) {
              const num = parseInt(match.match(/\d+/)?.[0] || '0', 10);
              // avoid extreme/corrupted values
              if (num > 0 && num < 180) {
                pacingMinutes += num;
              }
            }
          }
        } catch {
          // ignore unreadable files
        }
      }
    }

    const risks: CurriculumRisk[] = [];
    const suggestions: string[] = [];

    // Heuristic 1: Pacing & Timing
    if (!timingKeywordsFound && pacingMinutes === 0) {
      risks.push({
        level: 'medium',
        area: 'pacing',
        description: 'No explicit pacing or timing details detected in the curriculum files.',
        suggestion: 'Specify durations (e.g., "15 minutes") for each phase of the lesson to guide pacing.',
      });
      suggestions.push('Add a breakdown of timing for warm-up, core concept delivery, practice, and wrap-up.');
    } else {
      // Normalize pacing estimate if multiple files duplicates are summed
      if (pacingMinutes > 180) pacingMinutes = 90; // cap or normalize heuristic

      if (pacingMinutes > 90) {
        risks.push({
          level: 'high',
          area: 'pacing',
          description: `Total lesson time exceeds 90 minutes (${pacingMinutes} mins estimated). Risk of student fatigue and cognitive overload.`,
          suggestion: 'Streamline the content or split the lesson plan into two distinct modules.',
        });
        suggestions.push('Shorten the introduction or remove non-essential background theory to fit within 60-90 minutes.');
      } else if (pacingMinutes < 30 && pacingMinutes > 0) {
        risks.push({
          level: 'low',
          area: 'pacing',
          description: `Lesson timing is very brief (${pacingMinutes} mins estimated). Ensure key learning objectives can be covered.`,
          suggestion: 'Provide more in-depth explanations or add additional practice exercises.',
        });
      }
    }

    // Heuristic 2: Student Engagement & Active Learning
    if (activeLearningOccurrences === 0) {
      risks.push({
        level: 'medium',
        area: 'student-engagement',
        description: 'No student-led activities, practice phases, or group discussions were found in the lesson structure.',
        suggestion: 'Introduce a hands-on activity, pair-programming exercise, or structured team discussion.',
      });
      suggestions.push('Designate at least 40% of the class time to active student production rather than passive listening.');
    } else if (activeLearningOccurrences < 3) {
      risks.push({
        level: 'low',
        area: 'student-engagement',
        description: 'Low density of student-led interaction and hands-on practice (only minor active elements identified).',
        suggestion: 'Add check-for-understanding questions and a dedicated solo or group exercise.',
      });
    }

    // Heuristic 3: Misconception Identification
    if (!misconceptionsFound) {
      risks.push({
        level: 'low',
        area: 'teacher-readiness',
        description: 'No documentation flags common misconceptions or student pain points.',
        suggestion: 'Add a "Common Misconceptions" subsection outlining typical mistakes and corresponding corrective guidance.',
      });
      suggestions.push('Prepare corrective feedback loops for when students inevitably hit common implementation hurdles.');
    }

    // Heuristic 4: Teacher Readiness & Guidance
    if (!teacherGuidanceFound) {
      risks.push({
        level: 'medium',
        area: 'teacher-readiness',
        description: 'Detailed explanation strategies, real-world analogies, or step-by-step teacher scaffolding notes are missing.',
        suggestion: 'Ensure the Teaching Guide includes concrete analogies and prompts for explaining abstract definitions.',
      });
      suggestions.push('Add an explicit classroom management fallback for students who finish early.');
    }

    // Heuristic 5: Slide Deck Consistency
    if (slideFilesCount === 0) {
      risks.push({
        level: 'low',
        area: 'slide-consistency',
        description: 'No matching slide decks or visual presentation artifacts detected.',
        suggestion: 'Generate a supporting presentation deck using the HTML slides template to align visual teaching aids.',
      });
    }

    // Compute Overall Risk Level
    let overallRisk: CurriculumRiskLevel = 'none';
    if (risks.some((r) => r.level === 'high')) {
      overallRisk = 'high';
    } else if (risks.some((r) => r.level === 'medium')) {
      overallRisk = 'medium';
    } else if (risks.some((r) => r.level === 'low')) {
      overallRisk = 'low';
    }

    const rolloutReady = !risks.some((r) => r.level === 'high' || r.level === 'medium');

    return {
      projectId,
      overallRisk,
      risks,
      suggestions,
      rolloutReady,
      analyzedAt: new Date().toISOString(),
    };
  }

  // Helper to compile beautiful HTML report template for analysis
  function buildAnalysisHtmlReport(result: CurriculumAnalysisResult, project: any): string {
    const title = project.name || 'Curriculum Workspace';
    const statusMap = {
      high: { bg: '#fee2e2', fg: '#b91c1c', border: '#fca5a5', label: 'HIGH RISK' },
      medium: { bg: '#ffedd5', fg: '#c2410c', border: '#fed7aa', label: 'MEDIUM RISK' },
      low: { bg: '#fef9c3', fg: '#a16207', border: '#fef08a', label: 'LOW RISK' },
      none: { bg: '#d1fae5', fg: '#047857', border: '#a7f3d0', label: 'PASSED' },
    };

    const status = statusMap[result.overallRisk] || statusMap.none;

    const risksHtml = result.risks.length > 0
      ? result.risks.map((risk) => {
          const rStatus = statusMap[risk.level];
          return `
            <div class="risk-card" style="border-left: 4px solid ${rStatus.fg};">
              <div class="risk-header">
                <span class="risk-badge" style="background: ${rStatus.bg}; color: ${rStatus.fg};">${risk.level.toUpperCase()}</span>
                <span class="risk-area">${risk.area.replace('-', ' ').toUpperCase()}</span>
              </div>
              <div class="risk-desc">${risk.description}</div>
              ${risk.suggestion ? `<div class="risk-suggestion"><strong>Recommendation:</strong> ${risk.suggestion}</div>` : ''}
            </div>
          `;
        }).join('')
      : `<div class="no-risks">🎉 Excellent! No quality risks or rollout blockers detected. Perfect alignment.</div>`;

    const suggestionsHtml = result.suggestions.length > 0
      ? `<ul class="suggestions-list">` + result.suggestions.map((s) => `<li>${s}</li>`).join('') + `</ul>`
      : `<p>No further actions needed. The curriculum is structurally sound and optimized for execution.</p>`;

    return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Curriculum Review — ${title}</title>
  <style>
    :root {
      --canvas: #f8fafc;
      --surface: #ffffff;
      --border: #e2e8f0;
      --fg: #0f172a;
      --fg-muted: #475569;
      --accent: #10b981;
      --accent-strong: #059669;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 30px;
      background: var(--canvas);
      color: var(--fg);
      line-height: 1.5;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 30px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
    }
    .header {
      border-bottom: 1px solid var(--border);
      padding-bottom: 20px;
      margin-bottom: 24px;
    }
    .kicker {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--fg-muted);
      margin-bottom: 4px;
    }
    .title {
      font-size: 28px;
      font-weight: 800;
      margin: 0 0 12px 0;
      letter-spacing: -0.02em;
    }
    .meta-row {
      display: flex;
      gap: 16px;
      font-size: 13px;
      color: var(--fg-muted);
      flex-wrap: wrap;
    }
    .meta-item {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .overall-badge {
      display: inline-flex;
      align-items: center;
      padding: 6px 12px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 700;
      border: 1px solid;
    }
    .section-title {
      font-size: 18px;
      font-weight: 700;
      margin: 32px 0 16px 0;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--border);
    }
    .risk-card {
      background: #ffffff;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 16px;
      box-shadow: 0 1px 2px rgba(0,0,0,0.02);
    }
    .risk-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }
    .risk-badge {
      font-size: 10px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .risk-area {
      font-size: 11px;
      font-weight: 700;
      color: var(--fg-muted);
      letter-spacing: 0.05em;
    }
    .risk-desc {
      font-size: 14px;
      color: var(--fg);
      margin-bottom: 10px;
    }
    .risk-suggestion {
      font-size: 13px;
      background: #f8fafc;
      padding: 10px;
      border-radius: 6px;
      color: var(--fg-muted);
    }
    .no-risks {
      background: #ecfdf5;
      color: #065f46;
      border: 1px dashed #a7f3d0;
      border-radius: 8px;
      padding: 20px;
      text-align: center;
      font-weight: 600;
    }
    .suggestions-list {
      padding-left: 20px;
      margin: 0;
    }
    .suggestions-list li {
      font-size: 14px;
      color: var(--fg-muted);
      margin-bottom: 8px;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid var(--border);
      font-size: 11px;
      color: var(--fg-tertiary);
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="kicker">Intelligent Curriculum Review</div>
      <h1 class="title">${title}</h1>
      <div class="meta-row">
        <div class="meta-item">
          <strong>Review Status:</strong>
          <span class="overall-badge" style="background: ${status.bg}; color: ${status.fg}; border-color: ${status.border};">${status.label}</span>
        </div>
        <div class="meta-item">
          <strong>Analyzed At:</strong> ${new Date(result.analyzedAt).toLocaleString()}
        </div>
        <div class="meta-item">
          <strong>Rollout Ready:</strong> ${result.rolloutReady ? '✅ YES' : '❌ NO'}
        </div>
      </div>
    </div>

    <div class="section-title">Quality Assurance & Risk Detection</div>
    <div class="risks-container">
      ${risksHtml}
    </div>

    <div class="section-title">Suggestions for Optimization</div>
    <div class="suggestions-container">
      ${suggestionsHtml}
    </div>

    <div class="footer">
      AI Curriculum Workspace • Heuristic Quality Engine v1.0
    </div>
  </div>
</body>
</html>
    `;
  }

  // 3. POST /api/curriculum/projects/:id/analyze
  app.post('/api/curriculum/projects/:id/analyze', async (req: Request, res: Response) => {
    try {
      const projectId = req.params.id as string;
      const project = getProject(db, projectId);
      if (!project) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'Project not found');
      }

      // Run Heuristics Engine
      const result = await runHeuristicsAnalysis(projectId, project);

      // Create beautiful HTML report
      const templateHtml = buildAnalysisHtmlReport(result, project);

      // Persist as a Live Artifact
      const record = await createLiveArtifact({
        projectsRoot: PROJECTS_DIR,
        projectId,
        input: {
          title: 'Curriculum Quality Review',
          slug: 'curriculum-review',
          pinned: true,
          status: 'active',
          preview: {
            type: 'html',
            entry: 'index.html',
          },
          document: {
            format: 'html_template_v1',
            templatePath: 'template.html',
            generatedPreviewPath: 'index.html',
            dataPath: 'data.json',
            dataJson: result as any,
          },
        },
        templateHtml,
      });

      // Persist overallRisk in project metadata
      const meta = project.metadata || {};
      updateProject(db, projectId, {
        metadata: {
          ...meta,
          overallRisk: result.overallRisk,
        },
      });

      res.json({ result, artifact: record.artifact });
    } catch (err: any) {
      sendApiError(res, 500, 'INTERNAL_ERROR', String(err));
    }
  });

  // 4. POST /api/curriculum/projects/:id/validate-rollout
  app.post('/api/curriculum/projects/:id/validate-rollout', async (req: Request, res: Response) => {
    try {
      const projectId = req.params.id as string;
      const project = getProject(db, projectId);
      if (!project) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'Project not found');
      }

      // Run analysis
      const analysis = await runHeuristicsAnalysis(projectId, project);

      // Blocker = HIGH or MEDIUM level risks
      const blockers = analysis.risks.filter((r) => r.level === 'high' || r.level === 'medium');
      // Warning = LOW level risks
      const warnings = analysis.risks.filter((r) => r.level === 'low');

      const result: RolloutValidationResult = {
        projectId,
        ready: blockers.length === 0,
        blockers,
        warnings,
        validatedAt: new Date().toISOString(),
        triggeredBy: req.body?.triggeredBy || 'manual',
      };

      // Create a gorgeous preview html specifically for rollout validation
      const statusColor = result.ready ? '#059669' : '#dc2626';
      const templateHtml = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Rollout Validation — ${project.name}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      margin: 0; padding: 24px;
      background: #f8fafc; color: #0f172a;
    }
    .card {
      max-width: 600px; margin: 0 auto;
      background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px;
      padding: 24px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
    }
    .status-banner {
      background: ${result.ready ? '#d1fae5' : '#fee2e2'};
      border: 1px solid ${result.ready ? '#a7f3d0' : '#fca5a5'};
      color: ${statusColor};
      border-radius: 8px; padding: 16px;
      text-align: center; font-weight: 700; font-size: 16px;
      margin-bottom: 24px;
    }
    .blocker-title {
      font-size: 14px; font-weight: 700; color: #b91c1c;
      margin-bottom: 8px; text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .warning-title {
      font-size: 14px; font-weight: 700; color: #a16207;
      margin-bottom: 8px; text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .item {
      background: #f8fafc; border: 1px solid #e2e8f0;
      border-radius: 6px; padding: 12px; margin-bottom: 12px;
      font-size: 13px;
    }
    .suggestion {
      margin-top: 6px; font-weight: 600; color: #475569;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="status-banner">
      ${result.ready ? '✓ ROLLOUT READY — ALL CHECKS PASSED' : '✗ ROLLOUT BLOCKED — KEY CRITERIA MISSING'}
    </div>
    
    ${result.blockers.length > 0 ? `
      <div class="blocker-title">Blockers (${result.blockers.length})</div>
      ${result.blockers.map((b) => `
        <div class="item" style="border-left: 3px solid #b91c1c;">
          <strong>[${b.area.toUpperCase()}]</strong> ${b.description}
          ${b.suggestion ? `<div class="suggestion">Action: ${b.suggestion}</div>` : ''}
        </div>
      `).join('')}
    ` : ''}

    ${result.warnings.length > 0 ? `
      <div class="warning-title" style="margin-top: 24px;">Quality Warnings (${result.warnings.length})</div>
      ${result.warnings.map((w) => `
        <div class="item" style="border-left: 3px solid #a16207;">
          <strong>[${w.area.toUpperCase()}]</strong> ${w.description}
          ${w.suggestion ? `<div class="suggestion">Action: ${w.suggestion}</div>` : ''}
        </div>
      `).join('')}
    ` : ''}

    ${result.blockers.length === 0 && result.warnings.length === 0 ? `
      <p style="text-align: center; color: #475569; font-size: 14px;">Perfect rollout check! No issues detected.</p>
    ` : ''}
  </div>
</body>
</html>
      `;

      // Save as Rollout Validation Live Artifact
      const record = await createLiveArtifact({
        projectsRoot: PROJECTS_DIR,
        projectId,
        input: {
          title: 'Rollout Validation Report',
          slug: 'rollout-validation',
          pinned: false,
          status: 'active',
          preview: {
            type: 'html',
            entry: 'index.html',
          },
          document: {
            format: 'html_template_v1',
            templatePath: 'template.html',
            generatedPreviewPath: 'index.html',
            dataPath: 'data.json',
            dataJson: result as any,
          },
        },
        templateHtml,
      });

      // Persist overallRisk in project metadata
      const overallRisk = blockers.length > 0 ? 'high' : (warnings.length > 0 ? 'low' : 'none');
      const meta = project.metadata || {};
      updateProject(db, projectId, {
        metadata: {
          ...meta,
          overallRisk,
        },
      });

      res.json({ result, artifact: record.artifact });
    } catch (err: any) {
      sendApiError(res, 500, 'INTERNAL_ERROR', String(err));
    }
  });

  // 5. GET /api/curriculum/projects/:id/risk
  app.get('/api/curriculum/projects/:id/risk', async (req: Request, res: Response) => {
    try {
      const projectId = req.params.id as string;
      const project = getProject(db, projectId);
      if (!project) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'Project not found');
      }

      const artifacts = await listLiveArtifacts({
        projectsRoot: PROJECTS_DIR,
        projectId,
      });

      const reviewArtifact = artifacts
        .filter((art: any) => art.slug === 'curriculum-review' || art.slug === 'rollout-validation')
        .sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];

      if (!reviewArtifact) {
        return res.json({ overallRisk: 'none', risks: [], ready: true });
      }

      const record = await getLiveArtifact({
        projectsRoot: PROJECTS_DIR,
        projectId,
        artifactId: reviewArtifact.id,
      });

      const data = record.artifact.document?.dataJson as any;
      if (reviewArtifact.slug === 'rollout-validation') {
        const overallRisk = data.blockers?.length > 0 ? 'high' : data.warnings?.length > 0 ? 'low' : 'none';
        return res.json({
          overallRisk,
          risks: [...(data.blockers || []), ...(data.warnings || [])],
          ready: data.ready,
        });
      }

      res.json({
        overallRisk: data.overallRisk || 'none',
        risks: data.risks || [],
        ready: data.rolloutReady,
      });
    } catch (err: any) {
      sendApiError(res, 500, 'INTERNAL_ERROR', String(err));
    }
  });

  // 6. PATCH /api/curriculum/projects/:id/status
  app.patch('/api/curriculum/projects/:id/status', async (req: Request, res: Response) => {
    try {
      const projectId = req.params.id as string;
      const project = getProject(db, projectId);
      if (!project) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'Project not found');
      }

      const { curriculumStatus } = req.body || {};
      if (!curriculumStatus) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'curriculumStatus is required');
      }

      const validStatuses: CurriculumStatus[] = ['draft', 'in-review', 'approved', 'archived'];
      if (!validStatuses.includes(curriculumStatus)) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'Invalid curriculumStatus');
      }

      // Auto-trigger rollout validation when transitioning to approved
      if (curriculumStatus === 'approved') {
        const analysis = await runHeuristicsAnalysis(projectId, project);
        const blockers = analysis.risks.filter((r) => r.level === 'high' || r.level === 'medium');

        if (blockers.length > 0) {
          // Reject status transition with 422
          return res.status(422).json({
            error: 'ROLLOUT_VALIDATION_FAILED',
            message: 'Rollout validation failed: blockers are present that prevent approval.',
            blockers,
          });
        }

        // Save rollout validation artifact showing manual success
        const result: RolloutValidationResult = {
          projectId,
          ready: true,
          blockers: [],
          warnings: analysis.risks.filter((r) => r.level === 'low'),
          validatedAt: new Date().toISOString(),
          triggeredBy: 'status-change',
        };

        const templateHtml = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Rollout Validation — ${project.name}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      margin: 0; padding: 24px;
      background: #f8fafc; color: #0f172a;
    }
    .card {
      max-width: 600px; margin: 0 auto;
      background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px;
      padding: 24px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
    }
    .status-banner {
      background: #d1fae5; border: 1px solid #a7f3d0; color: #059669;
      border-radius: 8px; padding: 16px;
      text-align: center; font-weight: 700; font-size: 16px;
      margin-bottom: 24px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="status-banner">
      ✓ ROLLOUT READY — ALL CHECKS PASSED (AUTO-APPROVED)
    </div>
    <p style="text-align: center; color: #475569; font-size: 14px;">This project has been auto-validated and approved.</p>
  </div>
</body>
</html>
        `;

        await createLiveArtifact({
          projectsRoot: PROJECTS_DIR,
          projectId,
          input: {
            title: 'Rollout Validation Report',
            slug: 'rollout-validation',
            pinned: false,
            status: 'active',
            preview: {
              type: 'html',
              entry: 'index.html',
            },
            document: {
              format: 'html_template_v1',
              templatePath: 'template.html',
              generatedPreviewPath: 'index.html',
              dataPath: 'data.json',
              dataJson: result as any,
            },
          },
          templateHtml,
        });
      }

      // Update project metadata
      const meta = project.metadata || {};
      const updatedMetadata = {
        ...meta,
        curriculumStatus,
        overallRisk: curriculumStatus === 'approved' ? 'none' as const : meta.overallRisk,
      };

      const updatedProject = updateProject(db, projectId, {
        metadata: updatedMetadata,
      });

      res.json({ project: updatedProject });
    } catch (err: any) {
      sendApiError(res, 500, 'INTERNAL_ERROR', String(err));
    }
  });
}
