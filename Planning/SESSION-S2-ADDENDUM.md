# SESSION-S2-ADDENDUM.md — Pre-S3a Hardening Tasks

**Date:** February 21, 2026
**Context:** Post-S2 architecture review identified two items that should be addressed at the start of Session 3a before new ChordEngine work begins.

---

## Task 1: Chord Corpus Interval Spot-Check Tests

**Priority:** Must-do before S3a scoring work begins
**Rationale:** Session 2 tests verify structural properties of the corpus (count, no duplicates, depth classification, lookup correctness) but do not assert that specific chord qualities contain the correct musical intervals. A wrong interval set in the corpus would silently poison every chord suggestion produced by the scoring engine.

**Action:** Add 8–10 tests to `ChordCorpusTests.swift` that verify specific interval arrays for representative chord qualities:

```swift
// Examples — exact assertions against ChordQuality.intervals
func testMajorTriadIntervals() {
    XCTAssertEqual(ChordQuality.major.intervals, [0, 4, 7])
}

func testMinorTriadIntervals() {
    XCTAssertEqual(ChordQuality.minor.intervals, [0, 3, 7])
}

func testDominant7Intervals() {
    XCTAssertEqual(ChordQuality.dominant7.intervals, [0, 4, 7, 10])
}

func testMajor7Intervals() {
    XCTAssertEqual(ChordQuality.major7.intervals, [0, 4, 7, 11])
}

func testMinor7Intervals() {
    XCTAssertEqual(ChordQuality.minor7.intervals, [0, 3, 7, 10])
}

func testDiminished7Intervals() {
    XCTAssertEqual(ChordQuality.diminished7.intervals, [0, 3, 6, 9])
}

func testHalfDiminished7Intervals() {
    XCTAssertEqual(ChordQuality.halfDiminished7.intervals, [0, 3, 6, 10])
}

func testDominant7Sharp5Intervals() {
    XCTAssertEqual(ChordQuality.dominant7sharp5.intervals, [0, 4, 8, 10])
}

func testDominant9Intervals() {
    XCTAssertEqual(ChordQuality.dominant9.intervals, [0, 4, 7, 10, 14])
}

func testMinorMajor7Intervals() {
    XCTAssertEqual(ChordQuality.minorMajor7.intervals, [0, 3, 7, 11])
}
```

**Coverage:** At least one from each category: triad, seventh, altered, extended. This catches transposition errors in interval definition without needing to test all 324 corpus entries individually.

---

## Task 2: Strong-Beat Bonus API Extension

**Priority:** Should-do during S3a (bar segmentation phase provides the context)
**Rationale:** The KeyDetector's strong-beat heuristic (+0.03 from spec) was deferred in S2 because `[NoteEvent]` alone doesn't carry BPM/time signature. Session 3a builds bar segmentation, which requires exactly this context. Adding optional parameters now is backward-compatible and prevents a breaking API change later.

**Action:** Extend `KeyDetector.detect` with optional parameters:

```swift
// Current signature (S2):
static func detect(from notes: [NoteEvent]) -> [KeyCandidate]

// Updated signature (S3a):
static func detect(
    from notes: [NoteEvent],
    bpm: Double? = nil,
    timeSignature: (beats: Int, subdivision: Int)? = nil
) -> [KeyCandidate]
```

**Behavior:**
- When `bpm` and `timeSignature` are both non-nil, compute beat positions for each NoteEvent and apply +0.03 bonus to pitch classes occurring on strong beats (beat 1 always; beat 3 in 4/4; beat 1 in 3/4; beats 1 and 4 in 6/8)
- When either is nil, skip the heuristic (current behavior preserved)
- Existing call sites (`detect(from: notes)`) continue to compile unchanged

**Tests to add:**
- Strong-beat bonus effect on key ranking (ambiguous key resolves correctly with beat context)
- Nil parameters produce same results as current implementation (backward compatibility)
- Various time signatures (4/4, 3/4, 6/8)

---

## Task 3: Reject `@_exported import Foundation`

**Decision:** Do NOT implement the suggestion from S2 Known Issue #1.

**Rationale:** `@_exported` is an underscored Swift attribute (not stable API). Using it in CimarronCore would leak all of Foundation into every downstream package, undermining the headless package isolation that the SPM architecture was designed to enforce. The current targeted `import struct Foundation.UUID` pattern is correct and should remain the standard.

**Action:** No code change. This decision is recorded in the Master Plan Strategic Decisions table (Decision #8) and in CLAUDE.md as a coding rule.

---

## Integration Into Session 3a

These tasks are incorporated into the SESSION-3A-PLAN.md as **Phase 0 (Hardening)**, executed before the new ChordEngine scoring work begins. The S3a session plan reflects this sequencing.
