# Test Design: Library Loans: Borrowing Rules

- **Source spec:** `library-loans.md` (same folder). Line numbers below are from that file.
- **Techniques:** equivalence partitioning (EP), boundary value analysis (BVA, 2-value plus 3-value where helpful), state transition testing (STT).
- **Date:** 2026-11-16
- **Rule:** Expected results come only from the spec text. Where the spec does not say, the item is marked **OPEN** and listed in section 6. It is not guessed.

---

## 1. Rules under test (traceability)

| ID | Line | Spec text (verbatim) |
|---|---|---|
| R1 | 5 | "A member must be at least 12 years old to borrow without a guardian." |
| R2 | 6 | "A member may hold up to 5 books at a time." |
| R3 | 7 | "A member whose unpaid fines exceed 5.00 EUR cannot borrow." |
| R4 | 11 | "The loan period is between 7 and 28 days, chosen by the member at checkout." |
| R5 | 12 | "A loan may be renewed once, adding 14 days." |
| R6 | 16 | "A fine of 0.25 EUR is charged for each full day a book is overdue." |
| R7 | 17 | "Fines are capped at 10.00 EUR per book." |
| R8 | 21 | "A loan is always in one of these states: ACTIVE, OVERDUE, RETURNED, LOST." |
| R9 | 23-26 | The four transitions listed in section 4. |

---

## 2. Equivalence partitions

### 2.1 Member age, borrowing without a guardian (R1)

| Class | Partition | Valid? | Expected | Representative |
|---|---|---|---|---|
| EP-AGE-1 | age >= 12 | Valid | Can borrow without a guardian | 30 |
| EP-AGE-2 | 0 <= age < 12 | Invalid (without guardian) | Cannot borrow without a guardian | 8 |
| EP-AGE-3 | age < 12 **with** a guardian | ? | **OPEN (Q1)**: spec implies a guardian allows it but does not define how | 8 + guardian |
| EP-AGE-4 | age missing / negative / non-numeric | Invalid | **OPEN (Q2)**: no handling defined | -1, empty |

### 2.2 Books currently held (R2)

Partition on the number of books already held at the moment of a new checkout.

| Class | Partition | Expected | Representative |
|---|---|---|---|
| EP-HOLD-1 | 0-4 held | Checkout allowed (result: 1-5 held) | 2 |
| EP-HOLD-2 | 5 held | Checkout refused (would make 6) | 5 |
| EP-HOLD-3 | Which loans count as "held" (ACTIVE only? OVERDUE? LOST?) | **OPEN (Q3)** | 4 ACTIVE + 1 OVERDUE |

### 2.3 Unpaid fines (R3)

| Class | Partition | Expected | Representative |
|---|---|---|---|
| EP-FINE-1 | 0.00 <= fines <= 5.00 EUR | Can borrow | 2.50 |
| EP-FINE-2 | fines > 5.00 EUR | Cannot borrow | 7.75 |
| EP-FINE-3 | Scope: total across all loans, or per book? | **OPEN (Q4)** | two books at 3.00 each |

### 2.4 Loan period chosen at checkout (R4)

| Class | Partition | Expected | Representative |
|---|---|---|---|
| EP-PER-1 | 7-28 days | Accepted (assuming "between" is inclusive, **Q5**) | 14 |
| EP-PER-2 | < 7 days (incl. 0, negative) | Rejected | 3 |
| EP-PER-3 | > 28 days | Rejected | 40 |
| EP-PER-4 | Non-integer (e.g. 10.5) / missing | **OPEN (Q6)** | 10.5 |

### 2.5 Renewal (R5)

| Class | Partition | Expected | Representative |
|---|---|---|---|
| EP-REN-1 | First renewal of an ACTIVE loan | Allowed; due date + 14 days | renew once |
| EP-REN-2 | Second or later renewal | Refused | renew twice |
| EP-REN-3 | Renewal of an OVERDUE loan | **OPEN (Q7)** | renew after due date |
| EP-REN-4 | Renewal of a RETURNED or LOST loan | Not meaningful; refusal expected but **not stated (Q7)** | |
| EP-REN-5 | Other renewal preconditions (member over fine limit, under 12) | **OPEN (Q8)** | |

### 2.6 Fine amount per book (R6, R7)

Input: full days overdue `d`. Fine = 0.25 x d, capped at 10.00 (cap reached at d = 40).

| Class | Partition | Expected fine |
|---|---|---|
| EP-FA-1 | Not overdue (d = 0, incl. partial day < 24 h) | 0.00 |
| EP-FA-2 | 1 <= d <= 40 | 0.25 x d |
| EP-FA-3 | d > 40 | 10.00 (cap) |
| EP-FA-4 | Partial days (e.g. 3 days 20 h) | Only full days count: 0.75 |
| EP-FA-5 | Fine after loan becomes LOST, or for lost book replacement | **OPEN (Q9)** |

---

## 3. Boundary values

| ID | Rule | Boundary | Values to test | Expected |
|---|---|---|---|---|
| BV-AGE | R1 | 12 (inclusive, "at least") | 11, 12, 13 | 11 refused without guardian; 12 and 13 allowed. Age precision (day before / on 12th birthday) **OPEN (Q2)** |
| BV-HOLD | R2 | 5 (inclusive, "up to") | holding 4 -> 5th checkout; holding 5 -> 6th checkout | 5th allowed; 6th refused |
| BV-FINE | R3 | 5.00 EUR (exclusive, "exceed") | 4.99, 5.00, 5.01 (and 5.25, the next value reachable in 0.25 steps) | 4.99 and 5.00 can borrow; 5.01 / 5.25 cannot |
| BV-PER-LOW | R4 | 7 | 6, 7, 8 | 6 rejected; 7, 8 accepted (inclusive assumption, **Q5**) |
| BV-PER-HIGH | R4 | 28 | 27, 28, 29 | 27, 28 accepted; 29 rejected (inclusive assumption, **Q5**) |
| BV-REN-COUNT | R5 | 1 renewal | 0, 1, 2 renewals | 1st allowed, 2nd refused |
| BV-REN-DUE | R5 | Period after renewal | 28 + 14 = 42 days total | Due date = original due + 14. Whether total may exceed 28 is implied yes but **OPEN (Q10)** |
| BV-FA-START | R6 | first full overdue day | 0 d 23 h 59 m, 1 d 0 h, 1 d 1 h | 0.00, 0.25, 0.25 |
| BV-FA-CAP | R7 | cap at d = 40 | 39, 40, 41 | 9.75, 10.00, 10.00 |
| BV-LOST | R9 | 60 days overdue | 59, 60, 61 | 59 stays OVERDUE; 61 LOST. Day 60 itself ("after 60 days") **OPEN (Q11)** |
| BV-DUE | R9 | due date passes | at due date, 1 s / 1 day after | ACTIVE -> OVERDUE when due date passes. Exact moment (end of due day? time of checkout?) **OPEN (Q12)** |

Cross-rule note: fines reach the R3 limit with one book at d = 21 (5.25 EUR); d = 20 gives exactly 5.00 (still may borrow). Test 20 vs 21 days overdue on a single book as an integration boundary.

---

## 4. Loan state transitions

### 4.1 States

ACTIVE, OVERDUE, RETURNED, LOST (R8). Initial state: ACTIVE is implied at checkout but **not stated (Q13)**. RETURNED and LOST have no outgoing transitions in the spec.

### 4.2 Valid transitions (from the spec)

| ID | From | Event / condition | To | Line |
|---|---|---|---|---|
| T1 | (checkout) | Book checked out | ACTIVE | implied (Q13) |
| T2 | ACTIVE | Member returns the book | RETURNED | 23 |
| T3 | ACTIVE | Due date passes | OVERDUE | 24 |
| T4 | OVERDUE | Member returns the book | RETURNED | 25 |
| T5 | OVERDUE | 60 days overdue elapse | LOST | 26 |
| T6 | ACTIVE | Renewal (R5) | ACTIVE (due date +14) | 12, self-transition implied |

### 4.3 State table (event x state)

| State \ Event | return | due date passes | 60 days overdue | renew |
|---|---|---|---|---|
| **ACTIVE** | RETURNED (T2) | OVERDUE (T3) | n/a | ACTIVE, once (T6) |
| **OVERDUE** | RETURNED (T4) | n/a | LOST (T5) | **OPEN (Q7)** |
| **RETURNED** | invalid: not listed | invalid | invalid | invalid (Q7) |
| **LOST** | **OPEN (Q14)**: book found / returned after LOST? | invalid | invalid | invalid (Q7) |

### 4.4 Invalid transitions to test (should be refused, state unchanged)

| ID | Attempt | Expected |
|---|---|---|
| IT1 | RETURNED -> any (return again, renew, mark overdue) | Refused, stays RETURNED |
| IT2 | ACTIVE -> LOST directly | Not in spec: refused / never happens |
| IT3 | RETURNED -> ACTIVE / OVERDUE | Refused |
| IT4 | OVERDUE -> ACTIVE (e.g. by renewing or paying fine) | Not in spec; depends on Q7 |
| IT5 | LOST -> RETURNED | **OPEN (Q14)**: cannot set expected result |

### 4.5 Transition paths (0-switch and 1-switch coverage)

| Path | Sequence | Covers |
|---|---|---|
| P1 | checkout -> ACTIVE -> return -> RETURNED | T1, T2 |
| P2 | checkout -> ACTIVE -> due passes -> OVERDUE -> return -> RETURNED | T1, T3, T4 (+ fine charged) |
| P3 | checkout -> ACTIVE -> due passes -> OVERDUE -> 60 days -> LOST | T1, T3, T5 (+ fine capped at 10.00) |
| P4 | ACTIVE -> renew -> ACTIVE -> return -> RETURNED | T6, T2 |
| P5 | ACTIVE -> renew -> ACTIVE -> renew again (refused) | T6, BV-REN-COUNT |
| P6 | ACTIVE -> renew -> ACTIVE -> new due passes -> OVERDUE | T6, T3 (due date is the renewed one) |
| P7 | RETURNED -> return again | IT1 |

---

## 5. Suggested test conditions (summary)

1. Age 11 / 12 / 13 without guardian (BV-AGE).
2. 5th checkout allowed, 6th refused (BV-HOLD).
3. Unpaid fines 5.00 can borrow, 5.01 / 5.25 cannot (BV-FINE).
4. Loan period 6 / 7 / 8 and 27 / 28 / 29 (BV-PER).
5. One renewal adds exactly 14 days; second renewal refused (BV-REN).
6. Fine 0.00 under one full day; 0.25 at one full day; 9.75 / 10.00 / 10.00 at 39 / 40 / 41 days (BV-FA).
7. OVERDUE at 59 days stays OVERDUE; LOST after 60 (BV-LOST, day 60 pending Q11).
8. All transitions T1-T6 and invalid transitions IT1-IT4; paths P1-P7.

---

## 6. Open questions (gaps in the spec, do not guess expected results)

| # | Area | Question | Blocks |
|---|---|---|---|
| Q1 | R1 | How does a member under 12 borrow "with a guardian"? What counts as a guardian and how is it recorded? | EP-AGE-3 |
| Q2 | R1 | How is age computed (on the birthday itself, time zone)? What about missing or invalid birth dates? | BV-AGE precision, EP-AGE-4 |
| Q3 | R2 | Which loans count toward the 5 held: OVERDUE? LOST? | EP-HOLD-3 |
| Q4 | R3 | Is the 5.00 EUR limit on the member's total unpaid fines or per book? Do fines on still-open (not yet returned) loans count as "unpaid"? | EP-FINE-3 |
| Q5 | R4 | Is "between 7 and 28 days" inclusive of 7 and 28? | BV-PER-LOW/HIGH |
| Q6 | R4 | Whole days only? What happens with no period chosen (default)? | EP-PER-4 |
| Q7 | R5 | Can an OVERDUE loan be renewed? If so, does it return to ACTIVE? Is renewing RETURNED/LOST explicitly refused? | EP-REN-3/4, IT4 |
| Q8 | R5 | Do borrowing restrictions (fines > 5.00, holding limit, age) also block renewal? | EP-REN-5 |
| Q9 | R6/R7 | Do fines keep accruing after LOST? Is there a replacement charge for a lost book? Does the cap include it? | EP-FA-5 |
| Q10 | R4/R5 | Can a renewed loan exceed 28 days in total (e.g. 28 + 14 = 42)? | BV-REN-DUE |
| Q11 | R9 | "After 60 days overdue": LOST on day 60 or day 61? | BV-LOST |
| Q12 | R9 | When exactly does the due date "pass" (end of due day, checkout time + N days)? Is the first fine day the same moment? | BV-DUE, BV-FA-START |
| Q13 | R8 | Is ACTIVE the initial state at checkout? | T1 |
| Q14 | R9 | Can a LOST loan be returned (book found)? To which state, and what happens to the fine? | IT5, state table |
| Q15 | R6 | Are fines rounded or can partial amounts arise (e.g. by payments)? Is 5.01 reachable, or should BV-FINE use 5.25? | BV-FINE |
