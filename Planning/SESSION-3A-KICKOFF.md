# SESSION-3A-KICKOFF.md — Paste Into Claude Code

Copy everything below the line into Claude Code to launch Session 3a.

---

You are the **Lead Engineer** for Cimarron Session 3a — Chord Scoring Foundation.

## Context

Cimarron is an iOS music composition app. You are building the **ChordEngine** package — the 4-component scoring algorithm that evaluates how well each chord fits a melody segment. This is the mathematical core that Harmony Heat and suggestion ranking (Session 3b) will depend on.

## Your Environment

- Read `CLAUDE.md` and `AGENTS.md` first — they contain architecture rules and coding standards.
- Read `SESSION-3A-PLAN.md` — this is your complete implementation spec.
- Read `SESSION-S2-ADDENDUM.md` — this contains pre-session hardening tasks (Phase 0).
- Read `HANDOFF.md` — this is the current project state.
- The `MusicTheory` package is complete (S2). You will import and consume: `PitchClass`, `KeyDetector`, `KeyProfile`, `ChordCorpus`, `ChordQuality`, `TranspositionEngine`.
- The `ChordEngine` package exists as a placeholder that already compiles with `import MusicTheory`.

## Your Deliverables (in order)

### Phase 0 — Pre-Session Hardening (~15 min)
1. Add 10 chord interval spot-check tests to `ChordCorpusTests.swift` (verify specific interval arrays for major, minor, dim7, dom7, maj7, min7, half-dim7, dom7♯5, dom9, minMaj7)
2. Run `swift test` — fix any failures before proceeding
3. Extend `KeyDetector.detect` with optional `bpm:` and `timeSignature:` parameters for strong-beat bonus (+0.03)
4. Add strong-beat bonus tests (backward compat + beat context + time signatures)
5. Run `swift test` — all passing
6. **Commit:** `S3a: Add chord interval spot-checks and strong-beat bonus to KeyDetector`

### Phase 1 — Bar Segmentation (~30 min)
1. Create `BarSegmenter.swift` in ChordEngine — divides NoteEvents into bar-aligned Segments
2. Handle: 4/4, 3/4, 6/8 time signatures, notes spanning bar boundaries, empty bars
3. Create `BarSegmenterTests.swift` with comprehensive tests
4. **Commit:** `S3a: Add BarSegmenter with time-signature-aware bar division`

### Phase 2 — Scoring Components (~60 min, parallelize if using teammates)
1. `MelodyFitScorer.swift` — chord tone (1.0), common tension (0.6), avoid note (0.1), unrelated (0.3); duration-weighted. Returns 0.0–1.0.
2. `KeyCompatibilityScorer.swift` — diatonic (1.0) → secondary dominant (0.85) → modal interchange (0.70) → chromatic mediant (0.55) → tritone sub (0.40) → fully chromatic (0.20). Returns 0.0–1.0.
3. `VoiceLeadingScorer.swift` — sum of minimum pitch class distances between chords; normalized to 0.0–1.0. Returns 1.0 if no previous chord.
4. `SimplicityScorer.swift` — triad (1.0), fourNote (0.70), fiveNote (0.40), sixNote (0.20). Quality adjustments within depth.
5. Tests for all four scorers.
6. **Commits:** `S3a: Add MelodyFitScorer and KeyCompatibilityScorer` + `S3a: Add VoiceLeadingScorer and SimplicityScorer`

### Phase 3 — Composite Score + Weights (~30 min)
1. `ScoringWeights.swift` — Codable struct, `.default` (0.50/0.25/0.15/0.10), JSON loading, validation
2. `CompositeScorer.swift` — weighted composite of all 4 components. Returns 0.0–1.0.
3. Tests for JSON round-trip, custom weights, determinism.
4. **Commit:** `S3a: Add ScoringWeights and CompositeScorer with configurable JSON weights`

### Phase 4 — Integration (~20 min)
1. Verify Package.swift wiring: ChordEngine depends on MusicTheory and CimarronCore
2. Verify no `import UIKit`, `import SwiftUI`, or broad `import Foundation`
3. Run full `swift test` — ALL tests (S1 + S2 + S3a) passing
4. Update HANDOFF.md
5. **Commit:** `S3a: Integration verification and HANDOFF update`

## Hard Rules

- **All scorers return 0.0–1.0.** This is a non-negotiable contract.
- **No `import UIKit` or `import SwiftUI`** in any ChordEngine source file.
- **No broad `import Foundation`** — use targeted imports only (e.g., `import struct Foundation.UUID`).
- **`swift test` must pass after every phase.** Do not proceed to the next phase with failing tests.
- **Commit after each phase** with the `S3a:` prefix.
- **Determinism:** Same inputs must produce identical outputs. No randomness anywhere.
- **60+ new tests** is the target.

## Team Coordination (if using teammates)

If you spawn teammates:
- **Phase 2 Track A** (MelodyFitScorer + KeyCompatibilityScorer) → Lead
- **Phase 2 Track B** (VoiceLeadingScorer + SimplicityScorer) → Teammate: `scoring-engineer`
- All other phases are Lead-only.
- Teammate reads `SESSION-3A-PLAN.md` Phase 2 Track B for their spec.

## Quality Gate

Session is complete when:
- `swift test` passes with 0 failures
- 60+ new tests added
- All exit criteria in SESSION-3A-PLAN.md are checked
- HANDOFF.md reflects S3a completion
- CompositeScorer is callable from a placeholder (S3b readiness)

Begin by reading CLAUDE.md, AGENTS.md, SESSION-3A-PLAN.md, and SESSION-S2-ADDENDUM.md. Then start Phase 0.
