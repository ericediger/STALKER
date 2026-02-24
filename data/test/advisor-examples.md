# Advisor Example Conversations

Reference conversations for verifying the advisor covers all 5 intent categories.
Each example shows the user message, expected tool calls, and expected response characteristics.

---

## 1. Cross-Holding Synthesis

**User:** "How is my portfolio doing? Which positions are contributing the most to my returns?"

**Expected Tool Calls:**
1. `getPortfolioSnapshot({ window: "ALL" })`

**Expected Response Characteristics:**
- Reports total portfolio value, unrealized PnL, realized PnL
- Ranks holdings by unrealized PnL contribution (positive and negative)
- Compares allocation percentages across holdings
- Uses specific dollar amounts and percentages from the data

---

## 2. Tax-Aware Reasoning

**User:** "If I sold my oldest AAPL lots, what would the tax impact be?"

**Expected Tool Calls:**
1. `getHolding({ symbol: "AAPL" })` — to get FIFO lot breakdown
2. `getQuotes({ symbols: ["AAPL"] })` — to check price freshness

**Expected Response Characteristics:**
- Identifies the oldest lots from the FIFO breakdown (by openDate)
- States the current market price and its freshness
- Computes hypothetical realized gain: (market price - cost basis per share) * quantity for each lot
- Walks through the calculation explicitly, showing per-lot math
- Does NOT recommend whether to sell — presents data only
- Discloses quote staleness if applicable

---

## 3. Performance Attribution

**User:** "Compare my performance over the last month vs the last year. What changed?"

**Expected Tool Calls:**
1. `getPortfolioSnapshot({ window: "1M" })`
2. `getPortfolioSnapshot({ window: "1Y" })`

**Expected Response Characteristics:**
- Reports period change (dollar and percent) for both windows
- Identifies which holdings drove differences between the two periods
- Compares allocation shifts if applicable
- Uses concrete numbers, not vague statements

---

## 4. Concentration Awareness

**User:** "Am I too concentrated in any single holding?"

**Expected Tool Calls:**
1. `getPortfolioSnapshot({ window: "ALL" })`

**Expected Response Characteristics:**
- Lists holdings by allocation percentage (highest first)
- Flags any holding above 25% allocation as notably concentrated
- Compares top holding allocation to portfolio average
- Does NOT advise to diversify — presents concentration data factually

---

## 5. Staleness / Data Quality

**User:** "How fresh is my price data?"

**Expected Tool Calls:**
1. `getPortfolioSnapshot({ window: "ALL" })` — to get list of held symbols
2. `getQuotes({ symbols: [...all held symbols] })` — to check all quote timestamps

**Expected Response Characteristics:**
- Reports each symbol's last quote time and age in hours
- Flags any quotes older than 2 hours as stale
- Provides clear separation between fresh and stale data
- Does NOT suppress stale data — reports it with disclosure

---

## Response Style Verification

All responses should:
- Format dollars as `$X,XXX.XX` (commas, two decimal places)
- Format percentages as `X.XX%` (two decimal places)
- Use specific numbers from tool results, not generic commentary
- Avoid hedging language ("might", "could potentially")
- Stay within scope boundaries (analysis, not advice)
