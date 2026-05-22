# EXAMPLES.md

## How to Read These Examples

These examples show what good vs bad outputs look like for the AI curriculum system. They also demonstrate how Open Design patterns should (and should not) be adapted for curriculum use cases.

---

## Example 1 — Curriculum Feedback Analysis

**Input (from uploaded feedback file via `ConnectorsBrowser.tsx` import):**
> Students struggled with loops in Lesson 4.
> Teachers reported the explanation was too abstract.
> The activity exceeded class duration.

**Good AI Analysis (via curriculum-analysis skill → LiveArtifact output):**
```
Problem Detected:
  - Cognitive overload (too many abstract concepts before hands-on)
  - Poor pacing (activity exceeded timing estimate)

Root Cause:
  - No real-life analogy before coding concept
  - Activity was not split into scaffolded steps

Curriculum Risks:
  - risk: HIGH — abstract-first teaching before readiness check
  - risk: MEDIUM — timing estimate in Lesson Plan is unrealistic

Suggested Improvements:
  1. Add a physical loop analogy (clap pattern) before Scratch/Python
  2. Split activity into: demo → guided → independent steps
  3. Add teacher checkpoint after step 1
  4. Add backup activity for slow-paced classes

Estimated fix impact: Reduces cognitive load. Improves teacher confidence.
```

**Bad AI Analysis:**
> "Make the lesson more fun."

**Why bad:**
- Generic — no curriculum awareness
- Not actionable — no change to Lesson Plan, Teaching Guide, or Slides
- Ignores age group and pacing context

---

## Example 2 — Teacher AI Suggestion (inline highlight)

**Teacher highlighted in `FileViewer.tsx`:**
> "Organize an activity to help students understand loops."

**Good AI Suggestion (via ChatPane, context-aware):**
```
Classroom Activity — Clap Repeat:

1. Ask students to clap 3 times manually.
2. Ask: "What if a robot had to do this 100 times? How would we tell it?"
3. Write the instruction on the board: REPEAT 3 TIMES: clap
4. Transition: "In Scratch, this is called a loop."

Age group: 8–10 (adjust pacing — let slower groups demonstrate physically first)
Common mistake: Students confuse number of repetitions with total actions.
Fallback: Use a physical counting chain before Scratch blocks.
```

**Bad AI Suggestion:**
> "Explain loops clearly."

**Why bad:**
- Too vague — no classroom usability
- No specific activity, no timing, no teacher guidance
- Behaves like a generic chatbot

---

## Example 3 — Curriculum Risk Detection (before rollout)

**Input:** Sales wants to launch next week. Teaching Guides are incomplete. Only 30% of lessons reviewed.

**Good AI Response (via rollout-validation LiveArtifact):**
```
Rollout Risk: HIGH

Risks Detected:
  - CRITICAL: Teaching Guides incomplete (0/12 finalized)
  - HIGH: Only 30% of lessons have passed AI review
  - HIGH: Slides not yet validated against Lesson Plans
  - MEDIUM: No teacher pilot session documented

Recommendation: Delay rollout until:
  ✗ All Lesson Plans approved
  ✗ All Teaching Guides validated
  ✗ Slides reviewed for consistency
  ✗ Risk assessment passed for all lessons

Note: First student batches must never be used as test batches.
```

**Bad AI Response:**
> "The curriculum might need more work."

**Why bad:**
- Vague — no risk level, no actionable path
- Ignores what is actually incomplete
- Does not protect the first student batch

---

## Example 4 — Good Teacher AI Suggestion (concept explanation)

**Teacher highlighted:**
> "Explain variables in Python."

**Good AI Suggestion:**
```
Analogy: Storage Box

Tell students: "A variable is like a labeled box. We give it a name and put something inside."

Suggested activity:
  1. Give each student a sticky note (their variable).
  2. Ask them to write their name on it (variable name).
  3. Ask them to write their age on another note (stored value).
  4. Show: name = "Minh" → variable 'name' holds "Minh"

Common mistake:
  Students confuse the variable NAME with its VALUE.
  Fix: Always refer to "the name on the box" vs "what's inside".

Fallback for younger learners:
  Use Scratch variables first (drag, not type).
  Show the variable monitor updating live.

Age appropriateness: 9–12 (adjust complexity; younger groups use only string/int)
```

---

## Example 5 — Workspace Layout

**Good layout (adapts Open Design's `ProjectView.tsx`):**
```
| DesignFilesPanel (adapted)  |  FileWorkspace / FileViewer  |  ChatPane  |
| Curriculum Explorer sidebar |  Lesson Plan / Slide Canvas  | AI Assistant |
```

Why good:
- Curriculum remains the main artifact.
- AI is contextual, not dominant.
- Uses existing `ProjectView.tsx` layout — not a rebuild.
- Matches Open Design + Claude workspace philosophy.

**Bad layout:**
```
| Dashboard metrics cards |
| Curriculum data table  |
| Chatbot popup overlay  |
```

Why bad:
- Feels like an admin CRUD dashboard.
- AI is disconnected from the artifact.
- Breaks the Open Design workspace model.
- Harder to support inline AI on selected text.

---

## Example 6 — Design System Consistency (follows Open Design source)

**Good:**
```tsx
// Reuse existing components
import { Loading } from './components/Loading';
import { Toast } from './components/Toast';
import { WorkspaceTabsBar } from './components/WorkspaceTabsBar';

// Use design token CSS variables from index.css
style={{ color: 'var(--color-ink)', fontSize: 'var(--text-sm)' }}

// Use ProjectFileKind from contracts
import type { ProjectFileKind } from '@open-design/contracts';
const kind: ProjectFileKind = 'lesson-plan';

// Use LiveArtifact for generated curriculum docs
const artifact: LiveArtifact = await createLiveArtifact({ type: 'lesson-plan', ... });
```

**Bad:**
```tsx
// One-off button styles
<button style={{ backgroundColor: '#0a0a0a', color: 'white', borderRadius: 9999 }}>

// Hardcoded risk string in component
if (risk === 'high-risk') { ... }

// Duplicate modal logic instead of reusing SettingsDialog patterns
const MyModal = () => <div style={{ position: 'fixed', top: 0, ... }}>

// New state store that ignores config.ts
const useRiskStore = create((set) => ({ ... }));
```

Why bad:
- Hardcoded styles break design token system.
- Duplicated components increase maintenance cost.
- One-off state stores conflict with daemon sync pattern.
- Hardcoded strings cannot be internationalized.

---

## Example 7 — Live Artifact for Lesson Plan

**Good (adapts Open Design's `LiveArtifact` system):**
```
Agent generates Lesson Plan → stored as LiveArtifact (type: lesson-plan)
→ Appears in WorkspaceTabsBar as a live: tab
→ Rendered in FileViewer via srcDoc (HTML template from design-templates/live-artifact/)
→ Refreshes automatically when source curriculum files change
→ Connected to Teaching Guide and Slides as sibling artifacts
```

**Bad:**
```
Agent generates Lesson Plan → stored as a plain text file
→ No tab, no live refresh, no connection to other artifacts
→ Teacher cannot see it alongside Teaching Guide in one workspace
```

Why bad:
- Ignores the LiveArtifact system that already handles refresh, status, and tab management.
- Disconnects Lesson Plan from Teaching Guide and Slides.
- Loses the connected-artifact workspace model.

---

## Example 8 — AI Router Usage

**Good (uses existing Open Design agent routing):**
```
Curriculum restructuring request:
→ Route to Claude Sonnet (strong reasoning, via runtimes/defs/claude.ts)

Draft Teaching Guide generation:
→ Route to Gemini Flash (cost-efficient, via runtimes/defs/gemini.ts)

Slide visual suggestion:
→ Route to configured image/media provider (via media-config.ts)

Fallback when quota exceeded:
→ Route to next available agent (agent availability already tracked in agents list)
```

**Bad:**
```
Build a custom model-router class that fetches from its own config store
and ignores apps/daemon/src/runtimes/ and providerModels.ts
```

Why bad:
- Duplicates functionality already in the daemon.
- Ignores API key management that already exists.
- Creates a parallel system that will drift from the main codebase.

---

## Example 9 — File Import via Connectors

**Good (adapts Open Design's `ConnectorsBrowser.tsx`):**
```
Teacher clicks "Import Curriculum File"
→ ConnectorsBrowser opens (local files tab)
→ Teacher selects DOCX file
→ Daemon validates + extracts text (apps/daemon/src/import-export-routes.ts)
→ ProjectFile created with kind: 'lesson-plan', courseId, ageGroup
→ File appears in DesignFilesPanel (curriculum files tab)
```

**Bad:**
```
Build a custom file picker component with its own IPC channel
that bypasses the daemon's file validation and storage path
```

Why bad:
- Skips daemon validation (security risk).
- Creates a new IPC channel instead of reusing existing ones.
- Stored files won't appear in the existing file management system.

---

## Example 10 — Skill-Triggered Curriculum Analysis

**Good (adds curriculum-analysis skill under `skills/`):**
```
skill: curriculum-analysis
SKILL.md:
  name: Curriculum Quality Analyzer
  description: Analyzes lesson plans, teaching guides, and feedback to detect quality issues and rollout risks.
  triggers: [analyze curriculum, review lesson, check pacing, rollout risk]
  od.mode: prototype

Agent invokes skill mid-task when:
  - User asks "check this lesson"
  - User uploads feedback file
  - User requests rollout validation

Output: LiveArtifact (type: curriculum-review) with structured risk report
```

**Bad:**
```
Hardcode curriculum analysis logic directly into a custom API route
that doesn't use the skills system
```

Why bad:
- Skills system already handles invocation, context passing, and output.
- Bypassing it means losing prompt budget management, agent compatibility, and the gallery UI.