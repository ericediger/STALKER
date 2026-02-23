# SESSION-3B-KICKOFF.md — Paste Into Claude Code

Copy everything below the line into Claude Code to launch Session 3b.

---

You are the **Lead Engineer** for Cimarron Session 3b — Harmony Heat & Suggestion System.

## Context

Cimarron is an iOS music composition app. You are building the **Harmony Heat color system** and **suggestion ranking/manipulation** in the ChordEngine package. This session consumes the scoring components built in S3a and produces the `SuggestionService` API that the Harmonize screen (S8a) will call.

**This is the product's core differentiator.** The heat color system is what makes Cimarron unique — it shows users how "adventurous" each chord suggestion is.

## Your Environment

- Read `CLAUDE.md` and `AGENTS.md` first — architecture rules and coding standards.
- Read `SESSION-3B-PLAN.md` — your complete implementation spec.
- Read `HANDOFF.md` — current project state (should reflect S3a completion).
- The `ChordEngine` package now contains scoring components from S3a: `BarSegmenter`, `MelodyFitScorer`, `KeyCompatibilityScorer`, `VoiceLeadingScorer`, `SimplicityScorer`, `CompositeScorer`, `ScoringWeights`.
- You will build on top of these — do not modify the S3a scorers unless a bug is found.

## Your Deliverables (in order)

### Phase 1 — Harmony Heat Calculator (~30 min)
1. Create `HeatCalculator.swift` — 3-factor heat score:
   - Key distance (0.50 weight): `1.0 - KeyCompatibilityScorer.score()`
   - Chord complexity (0.25 weight): `1.0 - SimplicityScorer.score()`
   - Melody tension (0.25 weight): `1.0 - MelodyFitScorer.score()`
2. Color thresholds: green 0.00–0.39, yellow 0.40–0.69, red 0.70–1.00
3. **Important:** Heat is the INVERSE of fit. High fit = low heat = green. High heat = red = adventurous.
4. Run informal calibration check: C major chord in C major context → green, D♭7 → red
5. Create `HeatCalculatorTests.swift`
6. **Commit:** `S3b: Add HeatCalculator with 3-factor heat score and color thresholds`

### Phase 2 — Suggestion Ranking + Operations (~60 min, parallelize if using teammates)

**Track A — Ranking (Lead):**
1. `SuggestionRanker.swift` — rank all 324 candidates per segment, return top 12
2. Diversity constraint: ≤3 chords with same root
3. Heat distribution: target ≥6 green, 3–4 yellow, 2–3 red
4. Depth representation: ≥1 triad + ≥1 four-note in top 6
5. Constraint priority: diversity > heat distribution > depth
6. Create `SuggestionRankerTests.swift`
7. **Commit:** `S3b: Add SuggestionRanker with diversity and distribution constraints`

**Track B — Operations (Teammate: suggestion-ops-engineer):**
1. `DepthFilter.swift` — filter ranked list by `Set<ChordDepth>`, preserve rank order
2. `AutoFiller.swift` — assign rank-1 suggestions to empty unlocked segments
3. `Regenerator.swift` — re-rank with neighbor voice-leading bias (bonus from previous + next chord)
4. Tests for all three
5. **Commit:** `S3b: Add DepthFilter, AutoFiller, and Regenerator`

### Phase 3 — Suggestion Cache (~20 min)
1. `SuggestionCache.swift` — cache key from (barIndex, key, noteHash, previousChordID, weightsHash)
2. Invalidation rules: notes change, key changes, previous chord changes, weights change, transposition
3. Create `SuggestionCacheTests.swift`
4. **Commit:** `S3b: Add SuggestionCacheKey computation and invalidation rules`

### Phase 4 — SuggestionService (~30 min)
1. `SuggestionService.swift` — top-level API orchestrating: segment → score all → compute heat → rank → cache key
2. `SuggestionResult` struct with segments, suggestions per bar, cache keys
3. Methods: `generateSuggestions`, `regenerateBar`, `autoFill`
4. Create `SuggestionServiceTests.swift` — full pipeline tests
5. **Commit:** `S3b: Add SuggestionService orchestrating full scoring-heat-ranking pipeline`

### Phase 5 — Calibration + Integration (~30 min)
1. **Calibration tests (required):**
   - C major chord in C major melody → `.green`
   - E7 chord in C major melody → `.yellow`
   - D♭7 chord in C major melody → `.red`
   - Am chord in C major → `.green`
   - Additional spot checks
2. **If calibration fails:** Adjust heat factor weights or thresholds. Do NOT change S3a scoring components.
3. Verify no prohibited imports
4. Run full `swift test` — ALL tests (S1 + S2 + S3a + S3b) passing
5. Update HANDOFF.md with SuggestionService API surface for S8a
6. **Commit:** `S3b: Add calibration tests and integration verification`

## Hard Rules

- **Heat is the inverse of fit.** Do not confuse them.
- **Ranking constraints degrade gracefully.** If a melody produces all-red suggestions, the heat distribution target can't be met. Don't crash or loop.
- **No `import UIKit` or `import SwiftUI`** in any ChordEngine source file.
- **No broad `import Foundation`** — targeted imports only.
- **`swift test` must pass after every phase.**
- **Commit after each phase** with the `S3b:` prefix.
- **Determinism:** No randomness. Same inputs = same outputs.
- **50+ new tests** is the target.
- **Do not modify S3a scorers** unless you discover a bug (document it if so).

## Team Coordination (if using teammates)

If you spawn teammates:
- **Phase 2 Track A** (SuggestionRanker) → Lead
- **Phase 2 Track B** (DepthFilter + AutoFiller + Regenerator) → Teammate: `suggestion-ops-engineer`
- All other phases are Lead-only.
- Teammate reads `SESSION-3B-PLAN.md` Phase 2 Track B for their spec.

## Quality Gate

Session is complete when:
- `swift test` passes with 0 failures
- 50+ new tests added
- Calibration tests passing (C=green, E7=yellow, D♭7=red)
- Determinism verified
- All exit criteria in SESSION-3B-PLAN.md are checked
- HANDOFF.md reflects S3b completion with SuggestionService API documented
- S8a can consume `SuggestionService.generateSuggestions()`

Begin by reading CLAUDE.md, AGENTS.md, SESSION-3B-PLAN.md, and HANDOFF.md. Then start Phase 1.
