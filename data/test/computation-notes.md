# Reference Portfolio: Hand-Computed Expected Values

## Trading Day Calendar (2026-01-02 through 2026-03-20)

56 trading days total (weekdays only, no holiday filter).

| Day Index | Date       | Day of Week |
|-----------|------------|-------------|
| 0         | 2026-01-02 | Friday      |
| 1         | 2026-01-05 | Monday      |
| 2         | 2026-01-06 | Tuesday     |
| 3         | 2026-01-07 | Wednesday   |
| 4         | 2026-01-08 | Thursday    |
| 5         | 2026-01-09 | Friday      |
| 6         | 2026-01-12 | Monday      |
| 7         | 2026-01-13 | Tuesday     |
| 8         | 2026-01-14 | Wednesday   |
| 9         | 2026-01-15 | Thursday    |
| 10        | 2026-01-16 | Friday      |
| 11        | 2026-01-19 | Monday      |
| 12        | 2026-01-20 | Tuesday     |
| 13        | 2026-01-21 | Wednesday   |
| 14        | 2026-01-22 | Thursday    |
| 15        | 2026-01-23 | Friday      |
| 16        | 2026-01-26 | Monday      |
| 17        | 2026-01-27 | Tuesday     |
| 18        | 2026-01-28 | Wednesday   |
| 19        | 2026-01-29 | Thursday    |
| 20        | 2026-01-30 | Friday      |
| 21        | 2026-02-02 | Monday      |
| 22        | 2026-02-03 | Tuesday     |
| 23        | 2026-02-04 | Wednesday   |
| 24        | 2026-02-05 | Thursday    |
| 25        | 2026-02-06 | Friday      |
| 26        | 2026-02-09 | Monday      |
| 27        | 2026-02-10 | Tuesday     |
| 28        | 2026-02-11 | Wednesday   |
| 29        | 2026-02-12 | Thursday    |
| 30        | 2026-02-13 | Friday      |
| 31        | 2026-02-16 | Monday      |
| 32        | 2026-02-17 | Tuesday     |
| 33        | 2026-02-18 | Wednesday   |
| 34        | 2026-02-19 | Thursday    |
| 35        | 2026-02-20 | Friday      |
| 36        | 2026-02-23 | Monday      |
| 37        | 2026-02-24 | Tuesday     |
| 38        | 2026-02-25 | Wednesday   |
| 39        | 2026-02-26 | Thursday    |
| 40        | 2026-02-27 | Friday      |
| 41        | 2026-03-02 | Monday      |
| 42        | 2026-03-03 | Tuesday     |
| 43        | 2026-03-04 | Wednesday   |
| 44        | 2026-03-05 | Thursday    |
| 45        | 2026-03-06 | Friday      |
| 46        | 2026-03-09 | Monday      |
| 47        | 2026-03-10 | Tuesday     |
| 48        | 2026-03-11 | Wednesday   |
| 49        | 2026-03-12 | Thursday    |
| 50        | 2026-03-13 | Friday      |
| 51        | 2026-03-16 | Monday      |
| 52        | 2026-03-17 | Tuesday     |
| 53        | 2026-03-18 | Wednesday   |
| 54        | 2026-03-19 | Thursday    |
| 55        | 2026-03-20 | Friday      |

## Price Formulas

All prices are linear functions of the trading day index N.

| Instrument | Formula           | Start (Day 0) |
|------------|-------------------|---------------|
| AAPL       | 152 + N * 0.50    | $152.00       |
| MSFT       | 405 + N * 0.50    | $405.00       |
| VTI        | 248 + N * 0.25    | $248.00       |
| QQQ        | 478 + N * 0.50    | $478.00       |
| SPY        | 588 + N * 0.50    | $588.00       |
| INTC       | 21 + N * 0.10     | $21.00        |

**INTC gap:** No price bars for days 36-40 (2026-02-23 through 2026-02-27).
Carry-forward uses the last available price before the gap: Day 35 (2026-02-20).

## Transaction List (25 total, chronological by tradeAt)

| # | Date       | Day | Instr | Type | Qty | Price | Fees | Notes                    |
|---|------------|-----|-------|------|-----|-------|------|--------------------------|
| 1 | 2026-01-05 | 1   | AAPL  | BUY  | 100 | 150   | 0    | Lot 1                    |
| 2 | 2026-01-06 | 2   | VTI   | BUY  | 50  | 250   | 0    |                          |
| 3 | 2026-01-07 | 3   | MSFT  | BUY  | 200 | 400   | 0    |                          |
| 4 | 2026-01-08 | 4   | QQQ   | BUY  | 80  | 480   | 0    |                          |
| 5 | 2026-01-09 | 5   | SPY   | BUY  | 60  | 590   | 0    |                          |
| 6 | 2026-01-12 | 6   | AAPL  | BUY  | 50  | 160   | 0    | Lot 2                    |
| 7 | 2026-01-13 | 7   | INTC  | BUY  | 150 | 22    | 0    |                          |
| 8 | 2026-01-20 | 12  | VTI   | BUY  | 30  | 255   | 0    |                          |
| 9 | 2026-01-26 | 16  | QQQ   | SELL | 30  | 490   | 0    | Partial sell             |
| 10| 2026-02-02 | 21  | AAPL  | BUY  | 30  | 170   | 0    | Lot 3                    |
| 11| 2026-02-03 | 22  | SPY   | BUY  | 25  | 595   | 0    | Backdated                |
| 12| 2026-02-09 | 26  | MSFT  | SELL | 200 | 420   | 0    | Full close               |
| 13| 2026-02-10 | 27  | VTI   | BUY  | 20  | 260   | 0    |                          |
| 14| 2026-02-16 | 31  | AAPL  | SELL | 90  | 175   | 0    | FIFO from Lot 1          |
| 15| 2026-02-18 | 33  | QQQ   | BUY  | 40  | 485   | 0    | Re-entry                 |
| 16| 2026-02-20 | 35  | SPY   | BUY  | 40  | 600   | 0    |                          |
| 17| 2026-03-02 | 41  | QQQ   | SELL | 50  | 500   | 0    | Consumes Lot 1 remainder |
| 18| 2026-03-02 | 41  | MSFT  | BUY  | 100 | 425   | 0    | Re-enter after close     |
| 19| 2026-03-05 | 44  | INTC  | BUY  | 50  | 24    | 0    |                          |
| 20| 2026-03-09 | 46  | AAPL  | SELL | 40  | 180   | 0    | Multi-lot FIFO           |
| 21| 2026-03-10 | 47  | VTI   | BUY  | 10  | 265   | 0    |                          |
| 22| 2026-03-11 | 48  | SPY   | SELL | 30  | 610   | 0    | Partial sell             |
| 23| 2026-03-12 | 49  | QQQ   | BUY  | 20  | 495   | 0    |                          |
| 24| 2026-03-16 | 51  | AAPL  | BUY  | 20  | 178   | 0    | Lot 4                    |
| 25| 2026-03-17 | 52  | MSFT  | SELL | 50  | 430   | 0    | Partial close            |

---

## Checkpoint 1: 2026-01-09 (Day 5)

### Active Transactions (by end of day)

Tx 1-5 (AAPL BUY, VTI BUY, MSFT BUY, QQQ BUY, SPY BUY)

### FIFO Lot State

**AAPL:** 1 lot
- Lot 1: 100 @ $150, cost = 100 * 150 = $15,000

**VTI:** 1 lot
- Lot 1: 50 @ $250, cost = 50 * 250 = $12,500

**MSFT:** 1 lot
- Lot 1: 200 @ $400, cost = 200 * 400 = $80,000

**QQQ:** 1 lot
- Lot 1: 80 @ $480, cost = 80 * 480 = $38,400

**SPY:** 1 lot
- Lot 1: 60 @ $590, cost = 60 * 590 = $35,400

**INTC:** No transactions yet.

### Price Lookups (Day 5)

| Instrument | Day | Price Formula    | Close Price |
|------------|-----|------------------|-------------|
| AAPL       | 5   | 152 + 5*0.50     | $154.50     |
| VTI        | 5   | 248 + 5*0.25     | $249.25     |
| MSFT       | 5   | 405 + 5*0.50     | $407.50     |
| QQQ        | 5   | 478 + 5*0.50     | $480.50     |
| SPY        | 5   | 588 + 5*0.50     | $590.50     |

### Market Values

| Instrument | Qty | Close   | Value = Qty * Close | Cost Basis |
|------------|-----|---------|---------------------|------------|
| AAPL       | 100 | 154.50  | 15,450.00           | 15,000     |
| VTI        | 50  | 249.25  | 12,462.50           | 12,500     |
| MSFT       | 200 | 407.50  | 81,500.00           | 80,000     |
| QQQ        | 80  | 480.50  | 38,440.00           | 38,400     |
| SPY        | 60  | 590.50  | 35,430.00           | 35,400     |

### Portfolio Totals

- totalValue = 15450 + 12462.50 + 81500 + 38440 + 35430 = **183,282.50**
- totalCostBasis = 15000 + 12500 + 80000 + 38400 + 35400 = **181,300**
- unrealizedPnl = 183282.50 - 181300 = **1,982.50**
- realizedPnl = **0** (no sells yet)

---

## Checkpoint 2: 2026-01-27 (Day 17)

### Active Transactions (by end of day)

Tx 1-9:
- Tx 6: 2026-01-12 AAPL BUY 50 @ $160
- Tx 7: 2026-01-13 INTC BUY 150 @ $22
- Tx 8: 2026-01-20 VTI BUY 30 @ $255
- Tx 9: 2026-01-26 QQQ SELL 30 @ $490

### FIFO Lot State

**AAPL:** 2 lots
- Lot 1: 100 @ $150, cost = $15,000
- Lot 2: 50 @ $160, cost = $8,000
- Total: qty=150, cost=$23,000

**VTI:** 2 lots
- Lot 1: 50 @ $250, cost = $12,500
- Lot 2: 30 @ $255, cost = $7,650
- Total: qty=80, cost=$20,150

**MSFT:** 1 lot
- Lot 1: 200 @ $400, cost = $80,000

**QQQ:** 1 lot (after SELL 30)
- Original: 80 @ $480
- FIFO SELL 30: consume 30 from Lot 1, remaining = 80 - 30 = 50
- Lot 1: 50 @ $480, cost = 50 * 480 = $24,000

**SPY:** 1 lot
- Lot 1: 60 @ $590, cost = $35,400

**INTC:** 1 lot
- Lot 1: 150 @ $22, cost = 150 * 22 = $3,300

### Realized Trades

QQQ SELL 30 @ $490 from Lot 1 (80 @ $480):
- qty = 30
- proceeds = 30 * 490 = $14,700
- cost = 30 * 480 = $14,400
- realizedPnl = 14700 - 14400 = **$300**

Cumulative realized PnL = **$300**

### Price Lookups (Day 17)

| Instrument | Day | Price Formula     | Close Price |
|------------|-----|-------------------|-------------|
| AAPL       | 17  | 152 + 17*0.50     | $160.50     |
| VTI        | 17  | 248 + 17*0.25     | $252.25     |
| MSFT       | 17  | 405 + 17*0.50     | $413.50     |
| QQQ        | 17  | 478 + 17*0.50     | $486.50     |
| SPY        | 17  | 588 + 17*0.50     | $596.50     |
| INTC       | 17  | 21 + 17*0.10      | $22.70      |

### Market Values

| Instrument | Qty | Close   | Value = Qty * Close | Cost Basis |
|------------|-----|---------|---------------------|------------|
| AAPL       | 150 | 160.50  | 24,075.00           | 23,000     |
| VTI        | 80  | 252.25  | 20,180.00           | 20,150     |
| MSFT       | 200 | 413.50  | 82,700.00           | 80,000     |
| QQQ        | 50  | 486.50  | 24,325.00           | 24,000     |
| SPY        | 60  | 596.50  | 35,790.00           | 35,400     |
| INTC       | 150 | 22.70   | 3,405.00            | 3,300      |

### Portfolio Totals

- totalValue = 24075 + 20180 + 82700 + 24325 + 35790 + 3405 = **190,475**
- totalCostBasis = 23000 + 20150 + 80000 + 24000 + 35400 + 3300 = **185,850**
- unrealizedPnl = 190475 - 185850 = **4,625**
- realizedPnl = **300**

---

## Checkpoint 3: 2026-02-09 (Day 26)

### Active Transactions (by end of day)

Tx 1-12:
- Tx 10: 2026-02-02 AAPL BUY 30 @ $170
- Tx 11: 2026-02-03 SPY BUY 25 @ $595 (backdated)
- Tx 12: 2026-02-09 MSFT SELL 200 @ $420 (full close)

### FIFO Lot State

**AAPL:** 3 lots
- Lot 1: 100 @ $150, cost = $15,000
- Lot 2: 50 @ $160, cost = $8,000
- Lot 3: 30 @ $170, cost = $5,100
- Total: qty=180, cost=$28,100

**MSFT:** 0 lots (fully closed)
- SELL 200 from Lot 1 (200 @ $400): lot consumed entirely, removed
- Not present in holdingsJson

**VTI:** 2 lots (unchanged from CP2)
- Total: qty=80, cost=$20,150

**QQQ:** 1 lot (unchanged from CP2)
- Lot 1: 50 @ $480, cost=$24,000

**SPY:** 2 lots (backdated SPY BUY added chronologically)
- Lot 1: 60 @ $590 (Jan 9), cost = $35,400
- Lot 2: 25 @ $595 (Feb 3), cost = $14,875
- Total: qty=85, cost=$50,275

**INTC:** 1 lot (unchanged)
- Lot 1: 150 @ $22, cost=$3,300

### Realized Trades

MSFT SELL 200 @ $420 from Lot 1 (200 @ $400):
- qty = 200
- proceeds = 200 * 420 = $84,000
- cost = 200 * 400 = $80,000
- realizedPnl = 84000 - 80000 = **$4,000**

Cumulative realized PnL = 300 + 4000 = **$4,300**

### Price Lookups (Day 26)

| Instrument | Day | Price Formula     | Close Price |
|------------|-----|-------------------|-------------|
| AAPL       | 26  | 152 + 26*0.50     | $165.00     |
| VTI        | 26  | 248 + 26*0.25     | $254.50     |
| QQQ        | 26  | 478 + 26*0.50     | $491.00     |
| SPY        | 26  | 588 + 26*0.50     | $601.00     |
| INTC       | 26  | 21 + 26*0.10      | $23.60      |

MSFT: no position, not needed.

### Market Values

| Instrument | Qty | Close   | Value = Qty * Close | Cost Basis |
|------------|-----|---------|---------------------|------------|
| AAPL       | 180 | 165.00  | 29,700.00           | 28,100     |
| VTI        | 80  | 254.50  | 20,360.00           | 20,150     |
| QQQ        | 50  | 491.00  | 24,550.00           | 24,000     |
| SPY        | 85  | 601.00  | 51,085.00           | 50,275     |
| INTC       | 150 | 23.60   | 3,540.00            | 3,300      |

### Portfolio Totals

- totalValue = 29700 + 20360 + 24550 + 51085 + 3540 = **129,235**
- totalCostBasis = 28100 + 20150 + 24000 + 50275 + 3300 = **125,825**
- unrealizedPnl = 129235 - 125825 = **3,410**
- realizedPnl = **4,300**

---

## Checkpoint 4: 2026-02-25 (Day 38) -- During INTC Price Gap

### Active Transactions (by end of day)

Tx 1-16:
- Tx 13: 2026-02-10 VTI BUY 20 @ $260
- Tx 14: 2026-02-16 AAPL SELL 90 @ $175
- Tx 15: 2026-02-18 QQQ BUY 40 @ $485
- Tx 16: 2026-02-20 SPY BUY 40 @ $600

### FIFO Lot State

**AAPL:** After SELL 90 @ $175 on Feb 16
- Before: Lot 1: 100@150, Lot 2: 50@160, Lot 3: 30@170
- FIFO SELL 90: consume 90 from Lot 1 (has 100), remaining = 10
- After:
  - Lot 1: 10 @ $150, cost = $1,500
  - Lot 2: 50 @ $160, cost = $8,000
  - Lot 3: 30 @ $170, cost = $5,100
- Total: qty=90, cost=$14,600

**MSFT:** 0 lots (still fully closed)

**VTI:** 3 lots
- Lot 1: 50 @ $250, cost = $12,500
- Lot 2: 30 @ $255, cost = $7,650
- Lot 3: 20 @ $260, cost = $5,200
- Total: qty=100, cost=$25,350

**QQQ:** 2 lots (after BUY 40 @ $485)
- Lot 1: 50 @ $480, cost = $24,000
- Lot 2: 40 @ $485, cost = $19,400
- Total: qty=90, cost=$43,400

**SPY:** 3 lots (after BUY 40 @ $600)
- Lot 1: 60 @ $590, cost = $35,400
- Lot 2: 25 @ $595, cost = $14,875
- Lot 3: 40 @ $600, cost = $24,000
- Total: qty=125, cost=$74,275

**INTC:** 1 lot (unchanged)
- Lot 1: 150 @ $22, cost=$3,300

### Realized Trades (new since CP3)

AAPL SELL 90 @ $175, from Lot 1 (100 @ $150):
- qty = 90
- proceeds = 90 * 175 = $15,750
- cost = 90 * 150 = $13,500
- realizedPnl = 15750 - 13500 = **$2,250**

Cumulative realized PnL = 300 + 4000 + 2250 = **$6,550**

### Price Lookups (Day 38)

INTC gap: Days 36-40 (Feb 23-27) have no bars.
Last bar before gap: Day 35 (Feb 20) = 21 + 35*0.10 = $24.50
Carry-forward flag: isEstimated = true

| Instrument | Day | Price Formula     | Close Price | Notes           |
|------------|-----|-------------------|-------------|-----------------|
| AAPL       | 38  | 152 + 38*0.50     | $171.00     |                 |
| VTI        | 38  | 248 + 38*0.25     | $257.50     |                 |
| QQQ        | 38  | 478 + 38*0.50     | $497.00     |                 |
| SPY        | 38  | 588 + 38*0.50     | $607.00     |                 |
| INTC       | 35  | 21 + 35*0.10      | $24.50      | Carry-forward   |

### Market Values

| Instrument | Qty | Close   | Value = Qty * Close | Cost Basis | Notes       |
|------------|-----|---------|---------------------|------------|-------------|
| AAPL       | 90  | 171.00  | 15,390.00           | 14,600     |             |
| VTI        | 100 | 257.50  | 25,750.00           | 25,350     |             |
| QQQ        | 90  | 497.00  | 44,730.00           | 43,400     |             |
| SPY        | 125 | 607.00  | 75,875.00           | 74,275     |             |
| INTC       | 150 | 24.50   | 3,675.00            | 3,300      | isEstimated |

### Portfolio Totals

- totalValue = 15390 + 25750 + 44730 + 75875 + 3675 = **165,420**
- totalCostBasis = 14600 + 25350 + 43400 + 74275 + 3300 = **160,925**
- unrealizedPnl = 165420 - 160925 = **4,495**
- realizedPnl = **6,550**

---

## Checkpoint 5: 2026-03-03 (Day 42)

### Active Transactions (by end of day)

Tx 1-18:
- Tx 17: 2026-03-02 QQQ SELL 50 @ $500
- Tx 18: 2026-03-02 MSFT BUY 100 @ $425 (re-enter)

### FIFO Lot State

**AAPL:** Same as CP4
- Lot 1: 10 @ $150, Lot 2: 50 @ $160, Lot 3: 30 @ $170
- Total: qty=90, cost=$14,600

**MSFT:** 1 lot (re-entered)
- Lot 1: 100 @ $425, cost = $42,500

**VTI:** Same as CP4
- Total: qty=100, cost=$25,350

**QQQ:** After SELL 50 @ $500
- Before: Lot 1: 50 @ $480, Lot 2: 40 @ $485
- FIFO SELL 50: consume all 50 from Lot 1, lot removed
- After: Lot 2 only: 40 @ $485, cost = $19,400
- Total: qty=40, cost=$19,400

**SPY:** Same as CP4
- Total: qty=125, cost=$74,275

**INTC:** Same as CP4
- Total: qty=150, cost=$3,300

### Realized Trades (new since CP4)

QQQ SELL 50 @ $500, from Lot 1 (50 @ $480):
- qty = 50
- proceeds = 50 * 500 = $25,000
- cost = 50 * 480 = $24,000
- realizedPnl = 25000 - 24000 = **$1,000**

Cumulative realized PnL = 300 + 4000 + 2250 + 1000 = **$7,550**

### Price Lookups (Day 42)

INTC: gap ended on day 41 (Mar 2), bars resume. Day 42 price is normal.

| Instrument | Day | Price Formula     | Close Price |
|------------|-----|-------------------|-------------|
| AAPL       | 42  | 152 + 42*0.50     | $173.00     |
| MSFT       | 42  | 405 + 42*0.50     | $426.00     |
| VTI        | 42  | 248 + 42*0.25     | $258.50     |
| QQQ        | 42  | 478 + 42*0.50     | $499.00     |
| SPY        | 42  | 588 + 42*0.50     | $609.00     |
| INTC       | 42  | 21 + 42*0.10      | $25.20      |

### Market Values

| Instrument | Qty | Close   | Value = Qty * Close | Cost Basis |
|------------|-----|---------|---------------------|------------|
| AAPL       | 90  | 173.00  | 15,570.00           | 14,600     |
| MSFT       | 100 | 426.00  | 42,600.00           | 42,500     |
| VTI        | 100 | 258.50  | 25,850.00           | 25,350     |
| QQQ        | 40  | 499.00  | 19,960.00           | 19,400     |
| SPY        | 125 | 609.00  | 76,125.00           | 74,275     |
| INTC       | 150 | 25.20   | 3,780.00            | 3,300      |

### Portfolio Totals

- totalValue = 15570 + 42600 + 25850 + 19960 + 76125 + 3780 = **183,885**
- totalCostBasis = 14600 + 42500 + 25350 + 19400 + 74275 + 3300 = **179,425**
- unrealizedPnl = 183885 - 179425 = **4,460**
- realizedPnl = **7,550**

---

## Checkpoint 6: 2026-03-17 (Day 52) -- Final State

### Active Transactions (by end of day)

Tx 1-25 (all transactions):
- Tx 19: 2026-03-05 INTC BUY 50 @ $24
- Tx 20: 2026-03-09 AAPL SELL 40 @ $180
- Tx 21: 2026-03-10 VTI BUY 10 @ $265
- Tx 22: 2026-03-11 SPY SELL 30 @ $610
- Tx 23: 2026-03-12 QQQ BUY 20 @ $495
- Tx 24: 2026-03-16 AAPL BUY 20 @ $178
- Tx 25: 2026-03-17 MSFT SELL 50 @ $430

### FIFO Lot State

**AAPL:** After SELL 40 @ $180 (Mar 9), then BUY 20 @ $178 (Mar 16)
- Before sell: Lot 1: 10@150, Lot 2: 50@160, Lot 3: 30@170
- FIFO SELL 40:
  - Consume 10 from Lot 1 (fully consumed, removed)
  - Consume 30 from Lot 2 (50 -> 20 remaining)
- After sell: Lot 2: 20@160 (cost=$3,200), Lot 3: 30@170 (cost=$5,100)
- After BUY 20@178: add Lot 4: 20@178 (cost=$3,560)
- Final: qty=70, cost = 3200 + 5100 + 3560 = $11,860

**MSFT:** After SELL 50 @ $430 (Mar 17)
- Before sell: Lot 1: 100 @ $425
- FIFO SELL 50: consume 50 from Lot 1, remaining 50
- Final: Lot 1: 50@425, cost = $21,250

**VTI:** After BUY 10 @ $265 (Mar 10)
- Lot 1: 50@250, Lot 2: 30@255, Lot 3: 20@260, Lot 4: 10@265
- Total: qty=110, cost = 12500 + 7650 + 5200 + 2650 = $28,000

**QQQ:** After BUY 20 @ $495 (Mar 12)
- Lot 1: 40@485 (from Feb 18 re-entry), Lot 2: 20@495
- Total: qty=60, cost = 19400 + 9900 = $29,300

**SPY:** After SELL 30 @ $610 (Mar 11)
- Before sell: Lot 1: 60@590, Lot 2: 25@595, Lot 3: 40@600
- FIFO SELL 30: consume 30 from Lot 1 (60 -> 30 remaining)
- Final: Lot 1: 30@590 ($17,700), Lot 2: 25@595 ($14,875), Lot 3: 40@600 ($24,000)
- Total: qty=95, cost = 17700 + 14875 + 24000 = $56,575

**INTC:** After BUY 50 @ $24 (Mar 5)
- Lot 1: 150@22 ($3,300), Lot 2: 50@24 ($1,200)
- Total: qty=200, cost = 3300 + 1200 = $4,500

### All Realized Trades (cumulative)

1. QQQ SELL 30 @ $490, from 80@480 lot: PnL = (490-480)*30 = **$300**
2. MSFT SELL 200 @ $420, from 200@400 lot: PnL = (420-400)*200 = **$4,000**
3. AAPL SELL 90 @ $175, from 100@150 lot: PnL = (175-150)*90 = **$2,250**
4. QQQ SELL 50 @ $500, from 50@480 lot: PnL = (500-480)*50 = **$1,000**
5. AAPL SELL 40 @ $180:
   - 10 from Lot 1 @150: PnL = (180-150)*10 = $300
   - 30 from Lot 2 @160: PnL = (180-160)*30 = $600
   - Subtotal: **$900**
6. SPY SELL 30 @ $610, from 60@590 lot: PnL = (610-590)*30 = **$600**
7. MSFT SELL 50 @ $430, from 100@425 lot: PnL = (430-425)*50 = **$250**

**Total cumulative realized PnL = 300 + 4000 + 2250 + 1000 + 900 + 600 + 250 = $9,300**

### Price Lookups (Day 52)

| Instrument | Day | Price Formula     | Close Price |
|------------|-----|-------------------|-------------|
| AAPL       | 52  | 152 + 52*0.50     | $178.00     |
| MSFT       | 52  | 405 + 52*0.50     | $431.00     |
| VTI        | 52  | 248 + 52*0.25     | $261.00     |
| QQQ        | 52  | 478 + 52*0.50     | $504.00     |
| SPY        | 52  | 588 + 52*0.50     | $614.00     |
| INTC       | 52  | 21 + 52*0.10      | $26.20      |

### Market Values

| Instrument | Qty | Close   | Value = Qty * Close | Cost Basis |
|------------|-----|---------|---------------------|------------|
| AAPL       | 70  | 178.00  | 12,460.00           | 11,860     |
| MSFT       | 50  | 431.00  | 21,550.00           | 21,250     |
| VTI        | 110 | 261.00  | 28,710.00           | 28,000     |
| QQQ        | 60  | 504.00  | 30,240.00           | 29,300     |
| SPY        | 95  | 614.00  | 58,330.00           | 56,575     |
| INTC       | 200 | 26.20   | 5,240.00            | 4,500      |

### Portfolio Totals

- totalValue = 12460 + 21550 + 28710 + 30240 + 58330 + 5240 = **156,530**
- totalCostBasis = 11860 + 21250 + 28000 + 29300 + 56575 + 4500 = **151,485**
- unrealizedPnl = 156530 - 151485 = **5,045**
- realizedPnl = **9,300**
