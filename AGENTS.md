# AGENTS.md

## Project

AI Curriculum Workspace — a standalone Electron application for AI-powered curriculum management, analysis, lesson generation, and teacher assistance.

This is NOT a TPS module. It is adapted from the Open Design architecture (`open-design-main/`).

Designed for: R&D / Academic teams · Teaching Operations · Teachers · Curriculum Managers.

---

## Open Design as the Implementation Reference

This project is built by adapting Open Design's existing source code, architecture, and component structure.

Before writing any code:
1. Read `open-design-main/AGENTS.md` for root-level architecture rules.
2. Read `open-design-main/apps/AGENTS.md` for app-layer boundaries.
3. Read `open-design-main/apps/web/src/` to understand the actual component, state, and provider structure.
4. Read `open-design-main/design-templates/AGENTS.md` before adding any new template type.
5. Do NOT invent components, routes, or conventions that conflict with Open Design's source.

---

## Architecture Map (Open Design → Curriculum Workspace)

Open Design is a monorepo with this shape:

```
apps/web         — Next.js 16 App Router + React 18 frontend
apps/daemon      — Express + SQLite local daemon (owns /api/*, agent spawning, skills, artifacts)
apps/desktop     — Electron shell (reads web URL via sidecar IPC)
apps/packaged    — Thin packaged Electron entry
packages/contracts — Pure TypeScript web/daemon contract layer (shared types + API shapes)
packages/sidecar-proto / sidecar / platform — Process management primitives
skills/          — Functional skills the agent invokes mid-task (utilities, briefs, packagers)
design-templates/ — Rendering catalogue (decks, prototypes, HTML PPTs, image/video templates)
design-systems/  — Brand DESIGN.md files consumed by daemon
craft/           — Universal brand-agnostic craft rules
```

**Curriculum workspace maps to this shape.** Do not invent a parallel structure.

---

## Concept Mapping (Open Design → Curriculum Workspace)

| Open Design Concept | Curriculum Workspace Equivalent | Source Location |
|---|---|---|
| `Project` (general design workspace) | Curriculum Project (course/module scope) | `packages/contracts/src/api/projects.ts` |
| `ProjectFile` | Curriculum file (DOCX, PDF, PPTX, LP, TG) | `packages/contracts/src/api/files.ts` |
| `LiveArtifact` | Live Curriculum Artifact (Lesson Plan, Teaching Guide, Review) | `packages/contracts/src/api/live-artifacts.ts` |
| `design-templates/html-ppt*` | Teaching slide deck templates | `design-templates/html-ppt-*/` |
| `design-templates/web-prototype` | Interactive lesson prototype | `design-templates/web-prototype/` |
| `design-templates/live-artifact` | Live curriculum document | `design-templates/live-artifact/` |
| `skills/` (functional) | Curriculum analysis skill, lesson generator skill | `skills/` |
| `ConnectorsBrowser` | Curriculum file import (local, OneDrive, feedback) | `apps/web/src/components/ConnectorsBrowser.tsx` |
| `EntryShell` / `EntryView` | App entry / workspace launcher | `apps/web/src/components/EntryShell.tsx` |
| `ProjectView` | Curriculum workspace (3-panel layout) | `apps/web/src/components/ProjectView.tsx` |
| `FileWorkspace` | Curriculum document canvas | `apps/web/src/components/FileWorkspace.tsx` |
| `ChatPane` / `ChatComposer` | AI curriculum assistant panel | `apps/web/src/components/ChatPane.tsx` |
| `FileViewer` | Curriculum file viewer (PDF, HTML, PPT) | `apps/web/src/components/FileViewer.tsx` |
| `WorkspaceTabsBar` | Artifact tab bar | `apps/web/src/components/WorkspaceTabsBar.tsx` |
| `DesignFilesPanel` | Curriculum files panel (left sidebar) | `apps/web/src/components/DesignFilesPanel.tsx` |
| `DesignSystemsTab` | Curriculum templates / design systems | `apps/web/src/components/DesignSystemsTab.tsx` |
| Agent (Claude, Gemini, etc.) | AI curriculum engine (same routing model) | `apps/daemon/src/runtimes/defs/` |
| `media-config.ts` (API keys) | AI provider key management | `apps/daemon/src/media-config.ts` |
| `providerModels.ts` | AI router model selection | `apps/daemon/src/providerModels.ts` |
| Route: `/projects/:id` | Route: curriculum project workspace | `apps/web/src/router.ts` |
| Route: `home` view | Curriculum library home | `apps/web/src/router.ts` |

---

## Layout Principle

Use the **exact 3-panel layout** from Open Design's `ProjectView.tsx`:

```
| Left Sidebar (DesignFilesPanel) | Main Canvas (FileWorkspace/FileViewer) | Right Panel (ChatPane) |
```

Proportions follow Open Design:
- Left sidebar: 18–22%
- Main canvas: 56–64%
- Right AI panel: 20–24%

**Do not redesign the layout from scratch.** Adapt `ProjectView.tsx` and `FileWorkspace.tsx` for curriculum use cases.

---

## Routing

Follow Open Design's `router.ts` (a tiny custom push-state router — no react-router):

Existing routes to reuse/adapt:
- `{ kind: 'home', view: 'home' }` → Curriculum Library home
- `{ kind: 'home', view: 'projects' }` → All curriculum projects
- `{ kind: 'project', projectId, fileName }` → Open curriculum workspace
- `{ kind: 'home', view: 'templates' }` → Curriculum templates (`/templates`; legacy `/design-systems` redirects)

New curriculum-specific sub-views should follow the `EntryHomeView` union type pattern in `router.ts`.

---

## State Management

Follow Open Design's state patterns:

- Config lives in `apps/web/src/state/config.ts` — a localStorage-backed singleton with daemon sync.
- Projects live in `apps/web/src/state/projects.ts`.
- All API shapes belong in `packages/contracts/src/api/`.
- Do NOT add state stores that conflict with the existing pattern.
- Daemon config (`agentId`, `designSystemId`, `skillId`) is synced bidirectionally between localStorage and the daemon.

---

## AI / Agent Routing

Open Design already supports multi-provider AI routing. Reuse this:

- `apps/daemon/src/runtimes/defs/` — individual runtime definitions (claude.ts, gemini.ts, codex.ts, etc.)
- `apps/daemon/src/media-config.ts` — API key management (user-provided keys stored securely)
- `apps/daemon/src/providerModels.ts` — model listing per provider
- `apps/web/src/providers/daemon.ts` — web → daemon API calls
- `apps/web/src/state/config.ts` — `agentId`, `model`, `apiKey`, `apiProtocol` all live here

For curriculum AI routing, use the same agent/model selection mechanism. Add curriculum-specific skills and prompts; do NOT build a parallel routing system.

---

## Skills and Design Templates

### Skills (Functional — what the agent does)

Skills live in `skills/`. They invoke mid-task capabilities. For curriculum:
- `curriculum-analysis` skill → analyzes lesson quality, detects risks
- `lesson-plan-generator` skill → generates structured Lesson Plans
- `teaching-guide-generator` skill → generates Teaching Guides
- `curriculum-review` skill → rollout validation

Each skill has a `SKILL.md` with `name`, `description`, `triggers`, and `od.mode`.

### Design Templates (Rendering — what gets rendered to file)

Design templates live in `design-templates/`. For curriculum:
- Reuse `design-templates/html-ppt-*/` for teaching slide decks
- Reuse `design-templates/live-artifact/` for live curriculum documents (Lesson Plan, Teaching Guide)
- Reuse `design-templates/web-prototype/` for interactive lesson prototypes
- Adapt `design-templates/doc/` for curriculum document exports

Use existing templates where possible. Only create new ones when no existing template fits the curriculum use case.

---

## Component Reuse Rules

Before creating any new component:
1. Search `apps/web/src/components/` for an existing component.
2. Prefer adapting an existing component over creating a new one.
3. When a new component is needed, follow the same file naming and export conventions.

### Components to reuse directly

| Component | Use in curriculum |
|---|---|
| `EntryShell.tsx` | App entry shell |
| `ProjectView.tsx` | Curriculum workspace layout |
| `FileWorkspace.tsx` | Curriculum canvas |
| `FileViewer.tsx` | PDF/HTML/PPT viewer |
| `ChatPane.tsx` | AI assistant panel |
| `ChatComposer.tsx` | AI prompt input |
| `WorkspaceTabsBar.tsx` | Artifact tabs |
| `DesignFilesPanel.tsx` | Curriculum files sidebar |
| `ConnectorsBrowser.tsx` | File import browser |
| `AssistantMessage.tsx` | AI response rendering |
| `ToolCard.tsx` | AI tool result display |
| `SettingsDialog.tsx` | Settings (API keys, agents) |
| `Loading.tsx` | Loading state |
| `Toast.tsx` | Notifications |
| `InlineModelSwitcher.tsx` | AI model picker |

### Components to adapt for curriculum

| Open Design Component | Curriculum Adaptation |
|---|---|
| `HomeView.tsx` + `HomeHero.tsx` | Curriculum Library home |
| `DesignsTab.tsx` | Curriculum files tab |
| `DesignSystemsTab.tsx` | Curriculum templates tab |
| `NewProjectPanel.tsx` | New curriculum project panel |
| `SkillsSection.tsx` | Curriculum analysis skills |
| `RoutinesSection.tsx` | Scheduled curriculum routines |

---

## Type Contracts

All shared API types belong in `packages/contracts/src/api/`. Key types to reuse:

- `Project` — reuse for curriculum projects
- `ProjectFile` + `ProjectFileKind` — extend for curriculum file types (LP, TG, SLIDE, FEEDBACK)
- `LiveArtifact` / `LiveArtifactSummary` — reuse for live curriculum artifacts
- `Conversation` / `ChatMessage` — reuse for AI sessions
- `SkillSummary` / `SkillDetail` — reuse for curriculum skills
- `AgentInfo` — reuse for curriculum AI agents
- `ProviderModelOption` — reuse for AI model routing

Curriculum-specific types should be added to `packages/contracts` following the existing pattern.

---

## Daemon (Backend)

The daemon (`apps/daemon/`) is the backend. It:
- Owns all `/api/*` routes
- Manages SQLite at `.od/app.sqlite`
- Stores artifacts at `.od/artifacts/`
- Manages agent/skill invocation
- Handles API key storage at `.od/media-config.json`

For curriculum:
- Add curriculum-specific routes to a new `curriculum-routes.ts` file in `apps/daemon/src/`
- Store curriculum analysis results as Live Artifacts
- Add curriculum skills under `skills/`

**Do NOT** add domain routes directly to `server.ts` — add a route file and wire it in.

---

## Electron Desktop

Open Design's desktop (`apps/desktop/`) is an Electron shell that:
- Does NOT guess the web port
- Reads runtime status through sidecar IPC
- Opens the reported web URL

The packaged entry (`apps/packaged/`) handles the `od://` protocol and starts sidecars.

Reuse this architecture directly. Do NOT add direct Node.js API calls to the renderer.

---

## Design System

All visual tokens come from `DESIGN.md` (Mintlify-style system with Inter + Geist Mono).

Key tokens to use:
- `{colors.brand-green}` — accent CTA, active state indicator
- `{colors.primary}` — black pill buttons
- `{colors.ink}` — primary text
- `{colors.steel}` — secondary/sidebar text
- `{rounded.full}` — all buttons
- `{rounded.lg}` — all cards
- `{typography.body-md}` — body text (16px, 1.50 line-height)
- `{typography.body-sm}` — sidebar/secondary text

Animation: `cubic-bezier(0.23, 1, 0.32, 1)` — enter ~200ms, exit ~140ms. Never `ease-in`. Never scale from 0.

---

## Curriculum-Specific Content Rules

AI must:
- Understand full lesson context before generating (age group, course, objectives, version).
- Keep outputs practical for real classrooms.
- Explain why a curriculum change is recommended.
- Keep Lesson Plan, Teaching Guide, and Slides aligned.
- Detect risks before rollout.
- Prioritize teacher usability.

AI must not:
- Overload lessons.
- Generate unrealistic activities.
- Ignore age group or lesson dependencies.
- Treat first student batches as test batches.
- Behave like a generic chatbot.

---

## Development Commands

Follow Open Design's lifecycle. From the root of `open-design-main`:

```bash
pnpm install
pnpm tools-dev                    # Start daemon + web + desktop
pnpm guard                        # Guard check
pnpm typecheck                    # Type check

pnpm --filter @open-design/web typecheck
pnpm --filter @open-design/web test
pnpm --filter @open-design/daemon test
pnpm --filter @open-design/daemon build
pnpm --filter @open-design/desktop build
```

Do NOT add root `pnpm dev`, `pnpm build`, or `pnpm start` — all lifecycle goes through `pnpm tools-dev`.

---

## What to Reuse Directly

- Electron + sidecar IPC architecture
- Next.js 16 App Router web runtime
- Express daemon + SQLite backend
- `router.ts` (push-state routing)
- `packages/contracts` (API type contracts)
- `state/config.ts` (app config + daemon sync)
- `state/projects.ts` (project CRUD)
- `providers/daemon.ts` (web → daemon fetchers)
- All shared components listed above
- Existing AI runtime defs (claude, gemini, codex, etc.)
- API key management system (media-config)
- Design templates (html-ppt, live-artifact, web-prototype, doc)
- `design-systems/` brand DESIGN.md system
- `index.css` design token variables

## What to Adapt

- `HomeView` → Curriculum Library home
- `NewProjectPanel` → New curriculum project dialog
- `DesignsTab` → Curriculum files tab
- Project metadata → add curriculum fields (course, module, lesson, age group, version, status)
- Skills → add curriculum-specific skills
- Live Artifacts → use for Lesson Plans, Teaching Guides, Reviews

## What to Add (New Only When Necessary)

- Curriculum-specific routes in `apps/daemon/src/curriculum-routes.ts`
- Curriculum analysis skills in `skills/curriculum-*/`
- Curriculum document templates in `design-templates/` (only if no existing template fits)
- Curriculum-specific type extensions in `packages/contracts/src/api/curriculum.ts`

## What NOT to Do

- Do not recreate the router, state system, or component architecture from scratch.
- Do not use inline styles or magic strings.
- Do not add root lifecycle aliases.
- Do not expose Node.js APIs directly to the renderer.
- Do not store API keys in plain text.
- Do not build a chatbot-wrapper UX.
- Do not build an admin dashboard / CRUD dashboard UX.
- Do not restore `apps/nextjs` or `packages/shared`.