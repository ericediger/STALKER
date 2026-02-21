# PLANNING-SESSION-HANDOFF: STALKER Planning Session 1

**Date:** 2026-02-21
**Planner:** Engineering Lead + Business Stakeholder
**Outputs:** STALKER_MASTER-PLAN.md, SESSION-1-PLAN.md, SESSION-1-KICKOFF.md

---

## Decisions Made

### Epic Structure
Product decomposed into 10 epics (0–9). Epic 0 is pure infrastructure. Epics 1–4 are backend. Epic 5 is UI foundation. Epics 6A/6B are UI pages. Epic 7 is the advisor. Epic 8 is PnL validation. Epic 9 is polish.

### Session Count
9 sessions planned. Each session uses lead + 2 teammates (parallel or sequenced). Sessions are designed so teammates have non-overlapping filesystem scope to avoid merge conflicts.

### Session 1 Design Rationale
Session 1 combines scaffolding (Epic 0) with the analytics core (partial Epic 2) because:
1. Scaffolding alone is too small for a full session.
2. The FIFO lot engine has zero dependencies on infrastructure beyond shared types — the analytics-engineer can start immediately.
3. Getting the lot engine tested early de-risks the highest-impact component.

### Priority Order
`Correctness > Core CRUD > Market Data > Dashboard UI > Advisor > Polish` — applied globally when scope pressure hits.

### Scope Cut Decision: Overlay Chart
Per Product Brief Rec. 5, the overlay/compare chart is deferred to post-MVP. This saves ~1 session. The daily bars pipeline is already in scope (single-instrument charts), so the overlay is UI-only work when added later.

### PnL Validation Strategy
Reference portfolio fixture is built in Session 3 (after the portfolio value series builder exists). Full-stack cross-validation happens in Session 9. MVP signoff is gated on both automated fixture tests and manual cross-validation passing.

---

## Product State

- **Spec:** v4.0 — incorporates all product brief recommendations. Reviewed and approved.
- **UX Plan:** v1.0 — complete with page specs, component definitions, interaction patterns, empty states, design tokens.
- **Style Guide:** Bookworm dark-theme adapted for financial domain.
- **Code:** Nothing exists yet. Session 1 creates the repository from scratch.

---

## Stakeholder Notes

- Business stakeholder will relay session plans and review session reports.
- Engineering lead (this system) designs sessions and plans, business stakeholder executes via Claude Code.
- The continuity chain is: HANDOFF.md → Session Report → Plan Review → Tightened Plan → KICKOFF → Next Session.
- After Session 1 completes, the session report should be reviewed before Session 2's plan is finalized.

---

## What the Next Planner Needs to Know

1. Read `STALKER_MASTER-PLAN.md` first — it has the full roadmap, dependencies, and strategic decisions.
2. Session 1 plan and kickoff are ready to execute.
3. Sessions 2–9 have overview descriptions in the master plan but **do not have detailed PLAN or KICKOFF files yet.** These should be written one session ahead, after the prior session's report is reviewed.
4. The Team Checklist matrix is documented in the master plan (Section 5) — reference it when writing each session's verification steps.
5. All strategic decisions are final unless explicitly revisited.
