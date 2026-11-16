# Test Design: Library Loans (Borrowing Rules)

Source: `library-loans.md` (same folder). Line numbers (L#) refer to that file.
Techniques: equivalence partitioning (EP), boundary value analysis (BVA, 2-value: boundary and its nearest neighbour), state transition testing (STT).

Expected results below are only what the spec states. Where the spec is silent or ambiguous, the item is marked **OPEN** and listed in section 5 instead of being guessed.

---

## 1. Equivalence partitions

### EP-1 Member age, borrowing without a guardian (L5)
> "A member must be at least 12 years old to borrow without a guardian."

| ID | Partition | Representative | Expected |
|---|---|---|---|
| EP-1.1 | age >= 12, no guardian | 30 | Borrowing allowed |
| EP-1.2 | age < 12, no guardian | 8 | Borrowing refused |
| EP-1.3 | age < 12, with guardian | 8 + guardian | **OPEN (Q1)** — spec implies allowed but never says so |
| EP-1.4 | age invalid (negative, missing, non-numeric) | -1 / empty | **OPEN (Q2)** — no validation rule |

### EP-2 Books currently held (L6)
> "A member may hold up to 5 books at a time."

| ID | Partition | Representative | Expected |
|---|---|---|---|
| EP-2.1 | held 0..4 (can take one more) | 2 | New loan allowed |
| EP-2.2 | held >= 5 | 5 | New loan refused |
| EP-2.3 | held count includes OVERDUE / LOST loans? | 4 ACTIVE + 1 LOST | **OPEN (Q3)** |

### EP-3 Unpaid fines (L7)
> "A member whose unpaid fines exceed 5.00 EUR cannot borrow."

| ID | Partition | Representative | Expected |
|---|---|---|---|
| EP-3.1 | fines 0.00 .. 5.00 | 2.50 | Borrowing allowed |
| EP-3.2 | fines > 5.00 | 7.75 | Borrowing refused |

### EP-4 Loan period chosen at checkout (L11)
> "The loan period is between 7 and 28 days, chosen by the member at checkout."

| ID | Partition | Representative | Expected |
|---|---|---|---|
| EP-4.1 | 7..28 days | 14 | Accepted (assuming inclusive — **Q4**) |
| EP-4.2 | < 7 days | 3 | Rejected |
| EP-4.3 | > 28 days | 40 | Rejected |
| EP-4.4 | non-integer / zero / negative / empty | 10.5, 0, -1 | **OPEN (Q5)** — unit granularity not stated |

### EP-5 Renewal (L12)
> "A loan may be renewed once, adding 14 days."

| ID | Partition | Representative | Expected |
|---|---|---|---|
| EP-5.1 | first renewal of an ACTIVE loan | renewals = 0 | Allowed; due date + 14 days (base date **Q6**) |
| EP-5.2 | second or later renewal | renewals = 1 | Refused |
| EP-5.3 | renewal of an OVERDUE loan | — | **OPEN (Q7)** |
| EP-5.4 | renewal of a RETURNED / LOST loan | — | **OPEN (Q7)** (presumably refused, not stated) |

### EP-6 Overdue fine per book (L16-L17)
> "A fine of 0.25 EUR is charged for each full day a book is overdue." / "Fines are capped at 10.00 EUR per book."

| ID | Partition | Representative | Expected |
|---|---|---|---|
| EP-6.1 | not overdue (0 full days) | returned on due date | 0.00 EUR |
| EP-6.2 | overdue, under cap (1..39 full days) | 10 days | 2.50 EUR |
| EP-6.3 | overdue, at or past cap (>= 40 full days) | 50 days | 10.00 EUR |
| EP-6.4 | partial day overdue (< 24 h) | due + 23 h | 0.00 EUR ("full day") — day boundary definition **Q8** |
| EP-6.5 | multiple books overdue | 2 books × 50 days | 10.00 each, 20.00 total (cap is per book) |

---

## 2. Boundary values

| ID | Rule (line) | Boundary | Test values | Expected |
|---|---|---|---|---|
| BV-1 | Age (L5) | 12 | 11 / 12 | refused / allowed (no guardian) |
| BV-2 | Books held (L6) | 5 | 4 held → borrow 5th / 5 held → borrow 6th | allowed / refused |
| BV-3 | Unpaid fines (L7) | 5.00 EUR (strict "exceed") | 5.00 / 5.01 | allowed / refused. Note: fines accrue in 0.25 steps, so realistic neighbours are 5.00 / 5.25 (**Q9** on currency precision) |
| BV-4 | Loan period min (L11) | 7 | 6 / 7 | rejected / accepted (if inclusive, **Q4**) |
| BV-5 | Loan period max (L11) | 28 | 28 / 29 | accepted / rejected (if inclusive, **Q4**) |
| BV-6 | Renewal count (L12) | 1 | 1st / 2nd renewal | allowed / refused |
| BV-7 | Renewal length (L12) | +14 days | period 28 + renewal | due date = checkout + 42 days (spec does not cap total — **Q6**) |
| BV-8 | Fine start (L16) | 1 full day overdue | 0 full days / 1 full day | 0.00 / 0.25 EUR |
| BV-9 | Fine cap (L17) | 10.00 EUR = 40 days × 0.25 | 39 / 40 / 41 days | 9.75 / 10.00 / 10.00 EUR |
| BV-10 | ACTIVE → OVERDUE (L24) | due date | on due date / day after | ACTIVE / OVERDUE (exact instant "passes" — **Q8**) |
| BV-11 | OVERDUE → LOST (L26) | 60 days overdue | 59 / 60 / 61 days | OVERDUE / **OPEN (Q10)** / LOST |

---

## 3. State transitions

States (L21): ACTIVE, OVERDUE, RETURNED, LOST. Initial state on checkout: ACTIVE (implied, not stated — **Q11**).

### 3.1 Valid transitions (stated)

| ID | From | Event | To | Line |
|---|---|---|---|---|
| ST-1 | (checkout) | member borrows a book | ACTIVE | implied |
| ST-2 | ACTIVE | member returns book | RETURNED | L23 |
| ST-3 | ACTIVE | due date passes | OVERDUE | L24 |
| ST-4 | OVERDUE | member returns book | RETURNED | L25 |
| ST-5 | OVERDUE | 60 days overdue elapse | LOST | L26 |

Renewal (L12) is an event on ACTIVE that keeps the loan ACTIVE (ACTIVE → ACTIVE, due date +14); not listed in section 4 of the spec.

### 3.2 State × event table

| State \ Event | Return | Due date passes | 60 days overdue | Renew | Declare lost |
|---|---|---|---|---|---|
| ACTIVE | RETURNED | OVERDUE | n/a | ACTIVE (once) | **OPEN (Q12)** |
| OVERDUE | RETURNED | n/a | LOST | **OPEN (Q7)** | **OPEN (Q12)** |
| RETURNED | invalid (final?) | invalid | invalid | **OPEN (Q7)** | invalid |
| LOST | **OPEN (Q13)** | invalid | invalid | **OPEN (Q7)** | invalid |

### 3.3 Test sequences

| ID | Path | Covers |
|---|---|---|
| STS-1 | checkout → return before due | ST-1, ST-2 |
| STS-2 | checkout → due passes → return | ST-3, ST-4 (+ fine EP-6.2) |
| STS-3 | checkout → due passes → 60+ days → LOST | ST-3, ST-5 (+ fine cap 10.00) |
| STS-4 | checkout → renew → return | renewal on ACTIVE, ST-2 |
| STS-5 | checkout → renew → renew again | second renewal refused (BV-6) |
| STS-6 | RETURNED → return again | invalid event on final state; expected response **OPEN (Q14)** |
| STS-7 | LOST → return | **OPEN (Q13)** |

Coverage: STS-1..STS-3 give full 0-switch coverage of the 5 stated transitions. Invalid-transition tests (STS-5..STS-7) need the expected rejection behaviour defined first.

---

## 4. Cross-rule interactions worth testing

- Book cap + overdue: a LOST/OVERDUE loan still counted in "hold up to 5" (Q3).
- Fines threshold reachable through a single book: 21 full days overdue = 5.25 EUR → member blocked from borrowing (EP-3.2 via EP-6).
- Fine on a LOST book: does accrual stop at LOST, continue to the cap, or is a replacement charge applied (Q15)? With LOST at 60 days and cap at 40 days, the cap is always reached before LOST.
- Renewal moving the due date changes when OVERDUE starts and when fines begin.

---

## 5. Open questions (spec gaps — do not invent expected results)

| # | Question | Line |
|---|---|---|
| Q1 | Can a member under 12 borrow *with* a guardian? Any lower age limit? | L5 |
| Q2 | How is age validated (missing/invalid DOB; age computed on checkout date)? | L5 |
| Q3 | Do OVERDUE and LOST loans count toward the 5-book limit? | L6 |
| Q4 | Is "between 7 and 28 days" inclusive of 7 and 28? | L11 |
| Q5 | Are loan periods whole days only? What about 0, negative, empty input? | L11 |
| Q6 | Are the 14 renewal days added to the current due date or the renewal date? Can total exceed 28 days (max 42)? | L12 |
| Q7 | Which states allow renewal (OVERDUE? not RETURNED/LOST presumably)? Is renewal blocked by fines > 5.00 or by holding 5 books? | L12 |
| Q8 | What defines a "full day" and the moment the due date "passes" (end of day, time zone, closed days)? | L16, L24 |
| Q9 | Currency precision for fines (0.01 vs 0.25 steps); is 5.00 exactly allowed (spec says "exceed", so yes, but confirm)? | L7 |
| Q10 | "After 60 days overdue": LOST on day 60 or day 61? | L26 |
| Q11 | Is ACTIVE the initial state at checkout? | L21 |
| Q12 | Can a loan become LOST manually (member reports loss), including from ACTIVE? | L21-L26 |
| Q13 | Can a LOST book be returned (LOST → RETURNED)? What happens to fines? | L26 |
| Q14 | What is the system response to an invalid event (error, ignore)? Is RETURNED final? | L21 |
| Q15 | Fine/charge rules once a loan is LOST; do fines on RETURNED loans stay unpaid until paid? | L16-L17, L26 |
