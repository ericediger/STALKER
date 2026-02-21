# Project Setup & Session Management — Standard Operating Procedures

A reference guide for planning, executing, and reporting on Claude Code agent sessions.

---

## 1. Project Documentation Files

Every project maintains four core documents at the repository root. Agents read these at the start of every session.

| File | Purpose | Updated By |
|------|---------|------------|
| `CLAUDE.md` | Architecture overview, service topology, coding rules, agent protocols | Lead (each session) |
| `AGENTS.md` | Tech stack, design decisions, agent coordination patterns | Lead (when architecture changes) |
| `HANDOFF.md` | Current state — latest session results, test counts, known issues, what's next | Lead (end of every session) |
| `{PROJECT}_MASTER-PLAN.md` | Roadmap, strategic decisions, session status, cross-session concerns | Planner (planning sessions) |

Keep them separate. `HANDOFF.md` changes every session without touching the stable architecture docs. Agents only deep-read what's relevant to their scope, so separation keeps context window usage efficient.

---

## 2. Session Artifact Standard

Every session produces two files. Detail lives in the PLAN; the KICKOFF is a paste-ready launch prompt.

### Naming Convention

```
SESSION-{N}-PLAN.md      — Full implementation spec
SESSION-{N}-KICKOFF.md   — Short launch prompt for Claude Code
```

### The PLAN File

The plan is the complete reference document for the session. It contains everything an agent team needs without referencing other session plans.

**Required sections:**

- **Context** — Why this session exists, what it depends on, what depends on it
- **Read First** — Ordered list of files the lead and teammates must read before starting
- **Scope** — Exactly what gets built, with enough detail to prevent misinterpretation
- **Team Split** — Teammate names, one-line scope description, filesystem scope constraints
- **Agent Process Notes** — Always include these four items:
  1. "Teammates commit and continue without waiting for lead approval between tasks. Lead reviews at the end."
  2. "Skip MCP memory-keeper bootstrap — not needed for teammate agents."
  3. Whether teammates run in parallel or sequenced (and the handoff point if sequenced)
  4. Any process intel from prior sessions (e.g., "Session N had a teammate miss a final commit — lead must verify all commits before sign-off")
- **Critical Guardrails** — What must not break, plus an explicit scope cut order (e.g., "If scope creep threatens, cut Phase 4 before cutting Phases 1–3")
- **Verification** — Specific checks the lead performs before sign-off
- **Exit Criteria** — Checkbox list; session isn't done until all boxes are checked

**Baselines:** Include current test counts, TypeScript error counts, and any other metrics as concrete numbers (not "490+"). Update these from the most recent session report before every session.

### The KICKOFF File

The kickoff is what you paste into Claude Code. Keep it under one page.

1. Files to read first (always: `CLAUDE.md`, `AGENTS.md`, `HANDOFF.md`, plus the session PLAN)
2. MCP note: "Skip MCP memory-keeper bootstrap" (for multi-agent sessions)
3. Agent team composition — teammate names, one-line scope, filesystem scope constraint
4. Key sequencing or coordination notes (one sentence each)
5. Quality gates (`tsc --noEmit`, test suite baseline, push to origin)
6. Delegation mode statement ("I will coordinate only")

Use the two-file standard from the start of every project. Combined formats (kickoff containing the full plan) break down as plans get complex.

---

## 3. Planning Process

### Planning Sessions

A planning session is a dedicated conversation (typically in Claude.ai, not Claude Code) where you design the roadmap. It produces:

- **Master Plan** — Roadmap, strategic decisions, dependency chains, session status tracker
- **Session Plans + Kickoffs** — One pair per planned session
- **Planning Session Handoff** — Context document for the next planner

### Planning Session Handoff

Two files capture planning context for continuity:

| File | Purpose |
|------|---------|
| `PLANNING-SESSION-HANDOFF.md` | Full context — decisions made, rationale, product state, stakeholder notes |
| `PLANNING-SESSION-HANDOFF-SHORT.md` | Quick pointer — "read the master plan first, here's what's where" |

The short version exists because future planners may not need the full decision history — they just need to know where to look.

### Dependency Chains

Map session dependencies explicitly using ASCII art in the master plan:

```
3 (UI) → 4 (pipelines) → 5 (telemetry)
                               ↓
          6 (CI + inventories) → 7 (types) → 8 (validation) → 9 (handoff doc)
```

This makes it clear which sessions can be reordered and which are locked in sequence.

### Strategic Decisions

Record strategic decisions in the master plan with the label "final unless explicitly revisited." This prevents re-litigation during execution sessions. Include the rationale and alternatives considered for each decision.

### Priority Order

Set an explicit priority sequence and document it (e.g., Bugs → Product Features → Handoff Prep). When scope pressure hits during a session, the lead can cut lower-priority work without escalating.

### Deferred Items

Maintain a "not in roadmap" section in the master plan for ideas that come up but aren't planned. This prevents them from being forgotten while keeping them out of the active scope.

---

## 4. Session Execution

### Pre-Session Checklist

Before pasting the kickoff into Claude Code:

1. All services healthy (if applicable)
2. Working tree clean (no uncommitted changes)
3. Latest changes pulled from remote
4. Previous session's `HANDOFF.md` reflects current state
5. Session plan reviewed — baselines current, no stale assumptions
6. Plan tightened with intel from the most recent session report (see Section 6)

### Launching a Session

1. Open Claude Code at the project root
2. Paste the KICKOFF content
3. The lead reads the core docs and the session PLAN
4. Lead performs any pre-work specified in the plan (e.g., designing a type structure before spawning teammates)
5. Lead spawns teammates per the plan
6. Lead coordinates (delegate mode) or executes (solo mode)

### Agent Team Patterns

**Solo session:** The lead does everything. Use for small sessions, design work, or documentation.

**Lead + Teammates (Delegate Mode):** The lead coordinates, teammates execute. The lead's job is to relay information between teammates, verify work, and enforce scope.

Teammate spawn prompts must include:
- A clear role name (e.g., `backend-orchestration`, `validation-engineer`)
- One-line scope description
- Filesystem scope constraint (e.g., "Scope: `platform/backend/src/` only")
- Files to read first
- Specific deliverables

**Teammate Autonomy:** Always include in every multi-agent kickoff:

> "Teammates commit and continue without waiting for lead approval between tasks. Lead reviews at the end."

Without this explicit instruction, teammates stall waiting for approval they don't need, and the lead has to intervene mid-session.

**Sequenced vs. Parallel Teammates:** State explicitly whether teammates can run in parallel or need to wait for each other. If sequenced, specify the handoff point: "Teammate 1 completes shared definitions → Lead verifies → Teammate 2 begins migration."

### MCP Memory-Keeper

MCP (Model Context Protocol) memory servers provide persistent context within a session.

- **MCP bootstrap is lead-only.** Teammates do not need it.
- Add "Skip MCP memory-keeper bootstrap" to every multi-agent kickoff.
- If `CLAUDE.md` instructs agents to start an MCP session, add a note clarifying this is lead-only. Otherwise every teammate will attempt to bootstrap it.

### Scope Enforcement

Every plan must specify a scope cut order. Example:

> "If scope creep threatens, cut Phase 4 (explicit backend gate) before cutting Phases 1–3 (core pipeline + UI)."

The lead follows the cut order mechanically — no ad-hoc priority calls under pressure.

### Quality Gates

Run after every major change, not just at the end:

- `tsc --noEmit` — zero TypeScript errors
- Full test suite — zero regressions against the stated baseline
- Any session-specific verification checks from the plan

---

## 5. Session Wrap-Up

The wrap-up creates the continuity chain that makes the next session work. Follow every step in order.

### Wrap-Up Sequence

1. **Run quality gates one final time** — `tsc --noEmit`, full test suite
2. **Verify all exit criteria** — Go through the plan's checklist item by item
3. **Verify all teammates committed** — Check that every teammate's final work is in the tree. Do not skip this step.
4. **Update `HANDOFF.md`** — Current state, what was done, test counts (backend + frontend breakdown), known issues, what's next
5. **Update `CLAUDE.md` and `AGENTS.md`** — Only if architecture, rules, or agent protocols changed
6. **Commit with descriptive message** — e.g., "Session 5: Parallel pipelines — per-chapter enhancement, backend gates, blocking indicators"
7. **Push to origin** — The session is not done until the remote has everything. Include "pushed to origin" in exit criteria for every session.
8. **Generate session report** — Summary document for stakeholder review (see format below)

### Session Reports

Session reports go in a `Session Reports/` directory with date-prefixed names:

```
Session Reports/YYMMDD_SESSION-{N}-REPORT.md
```

A session report contains:
- What was accomplished (concrete deliverables, not process narrative)
- Exit criteria status (table with checkmarks)
- Test counts (before → after)
- Issues found or deferred
- What the next session should know
- Metrics where relevant (files changed, endpoints validated, types consolidated, etc.)

### HANDOFF.md Updates

`HANDOFF.md` is the single source of truth for "where are we right now." After every session it reflects:

- Latest session number and date
- Test counts (backend + frontend breakdown)
- TypeScript status
- What was just completed
- What's next
- Blocking issues or operational items
- Service health status if relevant

---

## 6. Inter-Session Review & Plan Tightening

Between sessions, the stakeholder or planner reviews the session report and tightens the next session's plan. This step is mandatory — it is the single highest-impact quality practice in the entire process.

### Review Workflow

1. **Session completes** → Agent produces session report
2. **Stakeholder reviews report** in Claude.ai (not Claude Code)
3. **Planner updates next session's plan and kickoff** with:
   - **Corrected baselines** — Test counts, `any` counts, validation coverage, or any other metrics that changed
   - **Process intel** — If a teammate got stuck, confused, or missed a commit, add an agent process note to the next kickoff
   - **New code references** — If the completed session created files, utilities, or patterns that the next session needs, list them explicitly in "Read First" or the scope description
   - **Verification items carried forward** — Any issue flagged but not resolved becomes a verification check in the next plan
   - **Inventory completeness checklists** — If the next session produces analysis docs (inventories, audits) that downstream sessions use as task lists, explicitly list what the inventories must cover, including all recent code from prior sessions
4. **Updated plan and kickoff** are ready for the next session

### What Breaks Without This Step

- Plans reference stale test baselines → quality gates use wrong numbers
- Teammates don't know about new utilities → they rebuild what already exists
- Inventories miss recent code → downstream sessions work from incomplete task lists
- Process friction repeats → teammates stall on the same issues session after session

---

## 7. Continuity Chain

The full continuity chain is:

```
HANDOFF.md → Session Report → Plan Review → Tightened Plan → KICKOFF → Next Session
```

If any link breaks, the next session starts with stale context. Common breaks and their fixes:

| Break | Fix |
|-------|-----|
| Forgot to push to origin | Include "pushed to origin" in every session's exit criteria |
| HANDOFF.md not updated | It's step 4 in the wrap-up sequence — don't skip steps |
| Session report not reviewed | Plan tightening is mandatory, not optional (Section 6) |
| Test baseline not updated | Use concrete numbers in every plan; update from the most recent report |
| Teammate missed final commit | Step 3 in wrap-up: verify all teammate commits before sign-off |

### Session Numbering

If operational work interrupts the planned sequence, the plan content and sequencing remain valid regardless of session number. Renumber and continue. Document the renumbering in the master plan.

---

## 8. File Organization Reference

```
project-root/
├── CLAUDE.md                           # Architecture, rules
├── AGENTS.md                           # Tech stack, agent protocols
├── HANDOFF.md                          # Current state (updated every session)
├── {PROJECT}_MASTER-PLAN.md            # Roadmap, decisions
├── PLANNING-SESSION-HANDOFF.md         # Full planning context
├── PLANNING-SESSION-HANDOFF-SHORT.md   # Quick pointer for next planner
├── SESSION-{N}-PLAN.md                 # Implementation spec per session
├── SESSION-{N}-KICKOFF.md              # Launch prompt per session
├── ENTERPRISE-HANDOFF.md               # Final handoff doc (if applicable)
├── design/
│   └── {FEATURE}-DESIGN.md             # Design docs from design sessions
├── audit/
│   └── {topic}-inventory.md            # Analysis deliverables
├── Session Reports/
│   └── YYMMDD_SESSION-{N}-REPORT.md    # Date-prefixed reports
└── .github/
    └── workflows/
        └── ci.yml                      # CI pipeline
```

---

## 9. New Project Quick-Start

1. Create `CLAUDE.md` — Architecture overview, coding rules, service topology
2. Create `AGENTS.md` — Tech stack, design decisions, agent coordination protocols
3. Create `HANDOFF.md` — Initial state, service health, baseline metrics
4. Run a planning session — Produce master plan, session plans, and kickoffs
5. Save both planning handoff files (full + short)
6. Verify every session plan includes: scope, team split, agent process notes (autonomy rule, MCP skip, sequencing, scope cut order), guardrails, verification checks, exit criteria with concrete baselines
7. Verify every kickoff references the plan and includes quality gates
8. Start Session 1

### Standard Agent Process Notes Template

Include in every multi-agent kickoff from day one:

```markdown
## Agent Process Notes
- Teammates commit and continue without waiting for lead approval
  between tasks. Lead reviews at the end.
- Skip MCP memory-keeper bootstrap — not needed for teammate agents.
- Lead must verify all teammates' work is committed before sign-off.
- [Parallel/Sequenced]: [state teammate dependencies or "fully independent —
  launch both immediately"]
- Scope cut order: [what to cut first if session runs long]
```
