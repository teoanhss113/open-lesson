# REQUIREMENTS.md

## App Requirements

The application is a standalone Electron app built on Open Design's architecture:
- `apps/desktop` Electron shell (reads web URL via sidecar IPC)
- `apps/web` Next.js 16 App Router frontend
- `apps/daemon` Express + SQLite daemon (owns all `/api/*` routes, file storage, AI invocation)
- `packages/contracts` Pure TypeScript API contract layer (shared across web and daemon)

It must support:
- Local curriculum file import (via `ConnectorsBrowser.tsx` and daemon file APIs)
- Curriculum library management (via `state/projects.ts` and `apps/daemon/src/projects.ts`)
- Document viewing (via `FileViewer.tsx` — already supports HTML, PDF iframe, and srcDoc render modes)
- AI-assisted curriculum analysis (via existing skill + agent invocation system)
- AI-generated artifacts (via `LiveArtifact` system in `packages/contracts/src/api/live-artifacts.ts`)
- Teacher-facing lesson assistance (via `ChatPane.tsx` + contextual inline AI)
- Versioning and curriculum status management
- Risk detection (via curriculum analysis skill)
- AI model routing (via existing `apps/daemon/src/runtimes/defs/` + `providerModels.ts`)

---

## Supported File Types

The app should import:
- DOCX — map to `ProjectFileKind` extension
- PDF — already supported by `FileViewer.tsx`
- PPTX — already supported (HTML PPT rendering via design templates)
- Markdown — already supported
- Plain text
- Feedback / survey documents

Each imported file must store (follow `ProjectFile` shape in `packages/contracts/src/api/files.ts`):
- `id`, `name`, `kind` (file type)
- Course / module / lesson mapping (extend `ProjectMetadata` in contracts)
- Upload date, version, owner, status
- Extracted text content where available (daemon-side extraction)

Do not store curriculum metadata outside the `Project` / `ProjectFile` / `ProjectMetadata` shape without first extending contracts.

---

## Curriculum Project Metadata

Extend `ProjectMetadata` (in `packages/contracts/src/api/projects.ts`) to add curriculum fields:
- `courseId` / `courseName`
- `moduleId` / `moduleName`
- `lessonId` / `lessonTitle`
- `ageGroup`
- `level`
- `curriculumVersion`
- `curriculumStatus` (draft | review | approved | archived)

These fields should be optional so non-curriculum projects are unaffected.

---

## Curriculum Review Requirements

Every curriculum review (triggered via AI skill) must validate:
- Lesson duration and pacing
- Learning objectives completeness
- Concept dependency order
- Age appropriateness
- Cognitive load
- Activity feasibility
- Teacher usability
- Slide consistency
- Teaching guide consistency
- Rollout readiness

Output is stored as a `LiveArtifact` (type: curriculum-review) in the daemon's artifact store.

---

## Lesson Plan Requirements

Generated Lesson Plans (stored as `LiveArtifact`) must include:
- Lesson title and target age/level
- Learning objectives
- Required materials
- Lesson flow (timing estimation per section)
- Teacher actions and student actions
- Main activities + practice section + wrap-up
- Common student difficulties
- Backup activity

Lesson Plans should use an appropriate design template from `design-templates/live-artifact/` or `design-templates/html-ppt-course-module/`.

---

## Teaching Guide Requirements

Generated Teaching Guides (stored as `LiveArtifact`) must include:
- Teaching intent and explanation strategy
- Suggested analogy
- Engagement checkpoints
- Classroom management tips
- Common misconceptions and fallback handling
- Notes for beginner teachers

---

## Slide Requirements

Generated teaching slides use design templates from `design-templates/html-ppt-*/`. They must:
- Follow a one-concept-per-slide structure
- Include a slide title, learning objective, minimal text, visual suggestion, interaction point, speaker note
- Avoid long paragraphs
- Prioritize classroom readability
- Align with the associated Lesson Plan and Teaching Guide

Reuse existing HTML PPT templates (e.g. `html-ppt-course-module`, `html-ppt-presenter-mode-reveal`, `html-ppt-knowledge-arch-blueprint`) before creating new ones.

---

## Teacher AI Suggestion Requirements

When teachers highlight content in the canvas (`FileViewer.tsx` / `FileWorkspace.tsx`):
- AI receives selected text + current lesson context (age group, course, objective, version)
- AI provides: easier explanation, teaching suggestion, alternative activity, real-life analogy, common mistake warning, fallback option
- Suggestions are delivered via `ChatPane.tsx` / `AssistantMessage.tsx`
- Suggestions must be contextual, practical, age-appropriate, and lesson-aligned

The mechanism reuses Open Design's existing text-selection → `ChatComposer` context injection pattern. Do NOT build a separate chatbot popup.

---

## Curriculum Risk Detection

AI must flag (stored as part of curriculum review `LiveArtifact`):
- Overloaded lessons
- Poor pacing or missing practice
- Weak transitions
- Missing student interaction
- Unrealistic timing
- Difficult onboarding for teachers
- High-risk rollout areas
- Incomplete artifacts (Lesson Plan, Teaching Guide, Slides)

Risk level must follow a defined enum (high / medium / low / none) stored in contracts.

---

## Rollout Validation

Before curriculum release, the system should verify:
- Lesson Plan completeness
- Teaching Guide completeness
- Slide consistency
- Activity feasibility
- AI risk review status (must be passed)
- Feedback validation completeness

System must warn if: curriculum is incomplete, teaching materials are missing, AI flags high risk, or feedback is insufficient.

Output is a structured report stored as a `LiveArtifact` (type: rollout-validation).

---

## AI Model Routing Requirements

The app uses Open Design's existing multi-provider AI routing system:
- `apps/daemon/src/runtimes/defs/` — Claude, Gemini, Codex, DeepSeek, Qwen, etc.
- `apps/daemon/src/media-config.ts` — API key storage (user-provided + company-provided)
- `apps/daemon/src/providerModels.ts` — model list per provider
- `apps/web/src/state/config.ts` — `agentId`, `model`, `apiProtocol` persisted config

Curriculum-specific routing strategy:
- Strong reasoning model (e.g. Claude Sonnet/Opus) for curriculum restructuring and risk analysis
- Cost-efficient model (e.g. GPT-4o-mini, Gemini Flash) for draft generation
- Fallback model when quota is limited

Do NOT build a custom routing system. Use the existing agent-selection mechanism.

---

## Design System Requirements

All UI must follow `DESIGN.md` tokens and Open Design component conventions:

- Use `{colors.brand-green}` only for accent CTAs and active state indicators
- Use `{colors.primary}` (black) for primary buttons on light surfaces
- Use `{rounded.full}` for all pill buttons; `{rounded.lg}` for all cards
- Use `{typography.body-md}` (16px, 1.50 line-height) for all curriculum document body text
- Use `{typography.body-sm}` (14px) for sidebar nav and secondary text
- Use `{typography.micro-uppercase}` for sidebar section headers

All components must:
- Use shared components from `apps/web/src/components/`
- Use design token CSS variables from `apps/web/src/index.css`
- Avoid inline styles
- Avoid magic strings — use constants from `packages/contracts`
- Avoid duplicated components

---

## Electron / IPC Security Requirements

Follow Open Design's established Electron security pattern:
- Desktop reads web URL via sidecar IPC — does NOT guess ports
- Preload scripts handle IPC safely — no direct Node.js API exposure to renderer
- Validate all uploaded files in daemon before processing
- Store API keys at `.od/media-config.json` (daemon-managed, not in plain localStorage)
- Separate data paths: `.od/app.sqlite` (DB), `.od/artifacts/` (renders), `.od/projects/:id/` (agent CWDs)
- Use `OD_DATA_DIR` env var to relocate all daemon runtime data (already supported)

---

## Data Storage

Follow Open Design's storage model (from daemon):
- SQLite: `.od/app.sqlite`
- Agent CWDs: `.od/projects/:id/`
- Artifacts: `.od/artifacts/`
- API credentials: `.od/media-config.json`
- Env override: `OD_DATA_DIR`

Curriculum data (file imports, generated artifacts, analysis results) all go through the daemon's existing storage paths.