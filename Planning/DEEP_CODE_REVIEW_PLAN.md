# Deep Code Review Plan (SWAT Execution Playbook)

## 1) Objective

Run a **deep, end-to-end technical scrub** of SPEAKEASY (Chrome extension + React/Vite codebase) to expose immediate defects and preempt future reliability, security, and scalability failures.

### Target outcomes
- Remove code bloat and stale paths.
- Detect architecture blind spots and coupling risks.
- Surface latent defects (logic, race, state, async, edge-case handling).
- Identify performance bottlenecks (bundle, runtime, extension lifecycle).
- Uncover security vulnerabilities in code and dependencies.
- Produce a prioritized remediation backlog with owners and closure criteria.

---

## 2) Scope Model for This Repository

### In-scope surfaces
- **Extension runtime layers:**
  - `src/background/service-worker.ts`
  - `src/content/extractor.ts`
  - `src/popup/**`
  - `src/options/**`
  - `src/lib/**`
  - `src/manifest.ts`
- **Build/runtime config:** `package.json`, `tsconfig.json`, `vite.config.ts`
- **Static assets + permissions posture:** `public/**`, generated manifest behavior, host permissions/API usage.

### Key risk seams (extension-specific)
1. Message passing between popup/content/background.
2. Content script extraction correctness and sanitization.
3. Persistence/cache consistency (`idb` + storage abstractions).
4. Service worker lifecycle edge cases (wake/sleep, retries, race windows).
5. API/LLM integration resilience and secret handling.

---

## 3) Operating Principles

1. **Evidence-only findings** (code refs, logs, traces, benchmark output).
2. **Risk-first triage** (impact × exploitability × frequency).
3. **Root-cause orientation** (not symptom lists).
4. **Actionable output** (repro steps, fixes, verification checks).
5. **No blind spots** (architecture, code, deps, CI/CD, operability).

---

## 4) Team Topology and Responsibilities

- **Mission Lead (Integrator)**
  - Owns sequencing, quality bar, and final risk register.
- **Architecture Agent**
  - Maps boundaries and dependency direction; flags cyclic/god-module patterns.
- **Static Quality Agent**
  - Type-health, complexity, duplication, dead code, correctness smells.
- **Performance Agent**
  - Build/bundle/runtime profiling; startup and interaction latency.
- **Security Agent**
  - Dependency/CVE scan, permission model, input/output hardening.
- **Reliability Agent**
  - Failure-mode review, retries/timeouts, storage consistency, test gaps.
- **Delivery Agent**
  - CI/release hygiene, rollback readiness, developer ergonomics.

---

## 5) Execution Phases (Deep Scrub Workflow)

## Phase 0 — Alignment + Baseline (Day 0)
- Confirm repository inventory and major flows.
- Lock severity taxonomy: Critical / High / Medium / Low.
- Create shared artifacts:
  - `risk-register.md`
  - `findings/` cards
  - `architecture-map.md`
  - `remediation-backlog.md`

## Phase 1 — Repository Recon
- Build module/import dependency map.
- Identify churn and complexity hotspots.
- Capture baseline command outputs (build, audit, size).

## Phase 2 — Static Deep Review
- Run type/build checks and targeted static analysis.
- Identify:
  - dead code/unused exports
  - error-swallowing paths
  - unsafe assumptions/null handling
  - excessive branching/duplicate logic

## Phase 3 — Architecture + Dataflow Audit
- Trace critical flows end-to-end:
  1. content extraction
  2. summarize request path
  3. cache/storage reads+writes
  4. playback controls and state transitions
- Validate boundary discipline and ownership.

## Phase 4 — Performance & Scalability
- Measure:
  - build size/startup cost
  - popup render cost and unnecessary rerenders
  - async contention and user-perceived latency
- Evaluate likely behavior at 2x and 5x usage load.

## Phase 5 — Security Hardening
- Audit dependency vulnerabilities.
- Inspect extension security posture:
  - permissions minimization
  - host exposure
  - input sanitization and output encoding
  - secrets handling / token lifecycle
- Produce threat matrix + mitigations.

## Phase 6 — Reliability & Operability
- Assess failure behavior:
  - API failure fallback
  - storage failure handling
  - message timeout/retry paths
- Assess observability gaps (diagnostic logs, error taxonomy).

## Phase 7 — Consolidation + Readout
- Merge and de-duplicate findings.
- Prioritize with weighted scoring.
- Deliver executive summary + tactical and strategic remediation plans.

---

## 6) Standard Finding Card Format

Each finding must contain:
1. ID and severity
2. Category (Bloat / Architecture / Defect / Performance / Security / Reliability / DevEx)
3. Exact location (file + function/flow)
4. Evidence (code snippet/log/metric/trace)
5. Risk statement (impact + blast radius)
6. Reproduction trigger/conditions
7. Remediation:
   - minimal safe fix
   - ideal long-term fix
8. Estimated effort + suggested owner
9. Verification steps and acceptance criteria

---

## 7) Prioritization Formula

`Priority Score = (Impact × Exploitability × Frequency × Detectability Gap) / Remediation Effort`

- **Critical:** immediate mitigation; release-blocking when applicable.
- **High:** next sprint commitment.
- **Medium:** planned with named owner/date.
- **Low:** opportunistic or bundled cleanup.

---

## 8) Command Checklist (Repo-Applicable)

Run these as baseline evidence:

```bash
npm run build
npm audit --omit=dev
npx tsc --noEmit
```

Optional deepening commands (if added by team in review branch):

```bash
# dependency graph / cycles tooling
# duplicate/complexity scans
# bundle analyzer (vite-compatible)
```

---

## 9) 10-Day Intensive Timeline

- **Day 1-2:** Recon + architecture map + baseline evidence.
- **Day 3-4:** Static scrub + correctness triage.
- **Day 5-6:** Security and permission-model review.
- **Day 7-8:** Performance + reliability failure-mode deep dive.
- **Day 9:** Consolidation and prioritization workshop.
- **Day 10:** Executive readout + remediation kickoff.

---

## 10) Definition of Done

Review is complete only when:
- Every Critical/High finding has owner + due date.
- All findings include repro and verification steps.
- Quick wins are merged or scheduled.
- Strategic refactors are captured with decision records.
- Residual risk is explicitly documented for leadership.

---

## 11) Immediate Next Actions

1. Run the three baseline commands and publish outputs.
2. Produce first architecture/dataflow map for extension flows.
3. Open initial risk register with first 48-hour findings.
4. Start parallel remediation for any Critical item.
