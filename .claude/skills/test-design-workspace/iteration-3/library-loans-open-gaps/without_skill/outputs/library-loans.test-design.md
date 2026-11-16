# Test Design: Library Loans: Borrowing Rules

Source: `library-loans.md` (line numbers cited as `Lnn`).
Techniques: equivalence partitioning (EP), boundary value analysis (BVA, 2-value: boundary and its nearest neighbour), state transition testing (STT).

Expected results are only stated where the spec states them. Anything the spec leaves open is marked **TBC** and listed in section 6 (Open questions). Those items must be answered by the product owner before tests for them get expected results.

---

## 1. Test conditions

| ID | Condition | Source |
|---|---|---|
| C1 | Minimum age to borrow without a guardian is 12 | L5 |
| C2 | Maximum books held at once is 5 | L6 |
| C3 | Unpaid fines above 5.00 EUR block borrowing | L7 |
| C4 | Loan period is 7 to 28 days, chosen at checkout | L11 |
| C5 | One renewal allowed, adding 14 days | L12 |
| C6 | Fine is 0.25 EUR per full overdue day | L16 |
| C7 | Fine capped at 10.00 EUR per book | L17 |
| C8 | Loan states and allowed transitions | L21-L26 |

---

## 2. Equivalence partitions

### C1: Member age (borrowing without a guardian), L5

| Partition | Values | Expected | Representative |
|---|---|---|---|
| EP1.1 valid | age >= 12 | Can borrow without guardian | 30 |
| EP1.2 invalid | 0 <= age < 12, no guardian | Cannot borrow without guardian (exact outcome: refused? TBC, Q1) | 8 |
| EP1.3 | age < 12, with guardian | **TBC** (Q1: spec implies allowed, does not say so or how) | 8 + guardian |
| EP1.4 invalid input | age unknown / missing / negative | **TBC** (Q2) | missing DOB |

### C2: Books currently held, L6

| Partition | Held before checkout | Expected | Representative |
|---|---|---|---|
| EP2.1 valid | 0-4 (checkout brings total to <= 5) | Checkout allowed | 2 |
| EP2.2 invalid | 5 or more | Checkout of another book refused | 5 |

Note: "hold" is assumed to mean ACTIVE + OVERDUE loans; whether LOST loans count is **TBC** (Q3).

### C3: Unpaid fines, L7

| Partition | Unpaid fines (EUR) | Expected | Representative |
|---|---|---|---|
| EP3.1 valid | 0.00 - 5.00 | Can borrow | 2.00 |
| EP3.2 invalid | > 5.00 | Cannot borrow | 7.50 |

### C4: Loan period chosen at checkout, L11

| Partition | Days | Expected | Representative |
|---|---|---|---|
| EP4.1 invalid | < 7 | Refused | 3 |
| EP4.2 valid | 7 - 28 | Accepted | 14 |
| EP4.3 invalid | > 28 | Refused | 35 |
| EP4.4 invalid | non-integer (e.g. 10.5), empty | **TBC** (Q4) | 10.5 |

"Between 7 and 28" is read as inclusive; confirm (Q5).

### C5: Renewal, L12

| Partition | Condition | Expected | Representative |
|---|---|---|---|
| EP5.1 valid | First renewal of an ACTIVE loan | Due date extended by 14 days | renewal #1 |
| EP5.2 invalid | Second (or later) renewal | Refused | renewal #2 |
| EP5.3 | Renewal of an OVERDUE loan | **TBC** (Q6) | |
| EP5.4 invalid | Renewal of a RETURNED or LOST loan | Assumed refused, **TBC** (Q6) | |

### C6/C7: Fine per book, L16-L17

| Partition | Full days overdue | Expected fine | Representative |
|---|---|---|---|
| EP6.1 | 0 (not overdue, or less than one full day) | 0.00 | 0 |
| EP6.2 | 1 - 39 | days x 0.25 | 10 days -> 2.50 |
| EP6.3 | >= 40 | 10.00 (cap) | 50 days -> 10.00 |

Fine reaches the cap at 40 x 0.25 = 10.00.

---

## 3. Boundary values

| ID | Rule | Boundary | Test values | Expected |
|---|---|---|---|---|
| BV1.1 | Age >= 12 (L5) | 12 | 11 (day before 12th birthday) | Not allowed without guardian |
| BV1.2 | | | 12 (on 12th birthday) | Allowed |
| BV2.1 | Max 5 books (L6) | 5 | holds 4, borrows 1 (-> 5) | Allowed |
| BV2.2 | | | holds 5, borrows 1 (-> 6) | Refused |
| BV3.1 | Fines exceed 5.00 (L7) | 5.00 | 5.00 | Can borrow (5.00 does not exceed 5.00) |
| BV3.2 | | | 5.01 (smallest step: 0.01 EUR, see Q7) | Cannot borrow |
| BV3.3 | | | 5.25 (smallest value reachable from 0.25 fines) | Cannot borrow |
| BV4.1 | Period >= 7 (L11) | 7 | 6 | Refused |
| BV4.2 | | | 7 | Accepted |
| BV4.3 | Period <= 28 (L11) | 28 | 28 | Accepted |
| BV4.4 | | | 29 | Refused |
| BV5.1 | Renewal count = 1 (L12) | 1 | 1st renewal | Accepted, due date + 14 days |
| BV5.2 | | | 2nd renewal | Refused |
| BV5.3 | Renewal of a 28-day loan | 28 + 14 = 42 | Renew a 28-day loan | **TBC** (Q8: is a total above 28 days allowed?) |
| BV6.1 | Full day overdue (L16) | 1 full day | 0 days, 23h59m after due | 0.00 |
| BV6.2 | | | exactly 1 full day | 0.25 |
| BV6.3 | | | 1 day 23h59m | 0.25 (only full days count) |
| BV7.1 | Cap 10.00 (L17) | 40 days | 39 days | 9.75 |
| BV7.2 | | | 40 days | 10.00 |
| BV7.3 | | | 41 days | 10.00 (capped, not 10.25) |
| BV8.1 | OVERDUE -> LOST after 60 days (L26) | 60 | 59 days overdue | Stays OVERDUE |
| BV8.2 | | | 60 days overdue | **TBC** (Q9: "after 60" = on day 60 or day 61?) |
| BV8.3 | | | 61 days overdue | LOST |
| BV9.1 | ACTIVE -> OVERDUE (L24) | due date | last moment of due date | ACTIVE |
| BV9.2 | | | first moment after due date | OVERDUE (exact cut-off time **TBC**, Q10) |

---

## 4. State transitions

### 4.1 State diagram

```
            return               
  ACTIVE ───────────────► RETURNED
    │                        ▲
    │ due date passes        │ return
    ▼                        │
  OVERDUE ───────────────────┘
    │
    │ 60 days overdue
    ▼
   LOST
```

Initial state: ACTIVE (on checkout; implied, not stated, Q11).
Terminal states: RETURNED, LOST (implied by absence of outgoing transitions, Q12).

### 4.2 Valid transitions (0-switch coverage)

| ID | From | Event | To | Source |
|---|---|---|---|---|
| T1 | ACTIVE | Member returns book | RETURNED | L23 |
| T2 | ACTIVE | Due date passes | OVERDUE | L24 |
| T3 | OVERDUE | Member returns book | RETURNED | L25 |
| T4 | OVERDUE | 60 days overdue elapse | LOST | L26 |

Renewal (L12) is an event that does not change state when applied to ACTIVE: ACTIVE -> ACTIVE with due date + 14 (T5, derived). Its effect on OVERDUE is TBC (Q6).

### 4.3 State table (valid and invalid pairs)

| From \ Event | Return | Due date passes | 60 days overdue | Renew |
|---|---|---|---|---|
| ACTIVE | RETURNED (T1) | OVERDUE (T2) | n/a | ACTIVE, +14 days (once) |
| OVERDUE | RETURNED (T3) | n/a | LOST (T4) | **TBC** (Q6) |
| RETURNED | invalid (already returned) | invalid | invalid | invalid (assumed) |
| LOST | **TBC** (Q13: found book returned?) | invalid | invalid | invalid (assumed) |

Invalid-transition tests (negative):

| ID | From | Event | Expected |
|---|---|---|---|
| N1 | RETURNED | Return again | Refused, state stays RETURNED (assumed) |
| N2 | RETURNED | Renew | Refused (assumed) |
| N3 | RETURNED | Time passes beyond due date | Stays RETURNED, no fine accrues (assumed) |
| N4 | LOST | Renew | Refused (assumed) |
| N5 | LOST | Return | **TBC** (Q13) |
| N6 | ACTIVE | Direct to LOST | Not possible (no such transition in L23-L26) |
| N7 | ACTIVE | 2nd renewal | Refused (L12) |

"Assumed" rows follow from the spec listing only these transitions; confirm with the product owner (Q12).

### 4.4 Paths (1-switch coverage)

| ID | Path | Notes |
|---|---|---|
| P1 | ACTIVE -> RETURNED | On-time return, fine 0.00 |
| P2 | ACTIVE -> OVERDUE -> RETURNED | Late return, fine = full days x 0.25, max 10.00 |
| P3 | ACTIVE -> OVERDUE -> LOST | Fine at LOST = 10.00 (capped at day 40); any replacement charge TBC (Q14) |
| P4 | ACTIVE -renew-> ACTIVE -> RETURNED | Return before new due date |
| P5 | ACTIVE -renew-> ACTIVE -> OVERDUE -> RETURNED | Overdue counted from the renewed due date |
| P6 | ACTIVE -renew-> ACTIVE -renew-> refused | Covers N7 |

---

## 5. Cross-rule combinations worth testing

| ID | Combination | Expected |
|---|---|---|
| X1 | Member with 5 books and 0.00 fines borrows | Refused (C2) |
| X2 | Member with 3 books and 5.25 fines borrows | Refused (C3) |
| X3 | Member aged 12 with 4 books, 5.00 fines, period 28 | Allowed (all on valid side of boundary) |
| X4 | Book returned on day 41 overdue: fine 10.00; member's total unpaid now > 5.00 | Next checkout refused (C3 + C7) |
| X5 | A returned overdue book frees a slot (5 -> 4 held) | Can borrow again if fines <= 5.00 |
| X6 | Fine cap is per book: two books each 50 days overdue | Total 20.00, not capped at 10.00 (L17 "per book") |

---

## 6. Open questions (TBC: no expected result until answered)

| # | Question | Source |
|---|---|---|
| Q1 | Can a member under 12 borrow with a guardian? How is the guardian recorded? Does the 5-book / fines rule apply to the guardian or the child? | L5 |
| Q2 | Is there a minimum age for membership, and how is a missing or invalid date of birth handled? | L5 |
| Q3 | Which loan states count as "held" toward the 5-book limit (ACTIVE, OVERDUE, LOST)? | L6 |
| Q4 | Is the loan period whole days only? How are non-integer or empty inputs handled? | L11 |
| Q5 | Is "between 7 and 28" inclusive of 7 and 28? (Design assumes yes.) | L11 |
| Q6 | Can an OVERDUE loan be renewed? If yes, does it go back to ACTIVE and is the accrued fine kept? | L12 |
| Q7 | Fine amounts move in 0.25 steps; can unpaid fines take other values (partial payments, e.g. 5.01)? | L7, L16 |
| Q8 | Does renewal add 14 days to the due date or to the renewal date? May the total exceed 28 days? | L11-L12 |
| Q9 | "After 60 days overdue": does LOST happen on day 60 or day 61? | L26 |
| Q10 | When exactly does the due date "pass" (end of the due day, library closing time, time zone)? | L24 |
| Q11 | Is ACTIVE the initial state on checkout? | L21 |
| Q12 | Are RETURNED and LOST terminal? Are all unlisted transitions refused? | L21-L26 |
| Q13 | What happens if a LOST book is returned (LOST -> RETURNED? fine refunded?) | L26 |
| Q14 | Does a LOST loan incur a replacement charge besides the capped fine? Does the fine keep counting after LOST? | L17, L26 |
| Q15 | What happens when a member reaches 12 during a guardian-backed loan, or when fines exceed 5.00 mid-loan (only new checkouts blocked, or renewals too)? | L5, L7, L12 |
