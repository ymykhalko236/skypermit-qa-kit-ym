# Test Design: Request Lifecycle (02-state-machine.md)

Source: `02-state-machine.md` (same folder). Line numbers (`L<n>`) refer to that file.
Techniques: state transition testing (full state x action matrix), equivalence partitioning (EP), boundary value analysis (BVA).

---

## 1. Model

### 1.1 States (L48-56)

| ID | State | Terminal | Observable at rest |
| --- | --- | --- | --- |
| S1 | `DRAFT` | no | yes |
| S2 | `SUBMITTED` | no | **no** (transient, L51) |
| S3 | `UNDER_REVIEW` | no | yes |
| S4 | `APPROVED` | no | yes |
| S5 | `REJECTED` | yes | yes |
| S6 | `CANCELLED` | yes | yes |
| S7 | `COMPLETED` | yes | yes |

### 1.2 Events / actions

| ID | Action | Caller | Source |
| --- | --- | --- | --- |
| E1 | submit | Operator | L31 |
| E2 | gates pass (automatic) | System, inside submit | L32 |
| E3 | gates fail (automatic) | System, inside submit | L33 |
| E4 | approve | Reviewer (`X-Reviewer-Id`) | L34 |
| E5 | reject | Reviewer, `note` required | L35 |
| E6 | complete | Maintenance endpoint | L36 |
| E7 | cancel | Operator | L37-40 |

Rule for everything else: "Any `(from, action)` pair not listed here is illegal and must return `409`" (L24-25, L42-44).

---

## 2. State transition table (valid transitions, 0-switch coverage)

| T# | From | Action / guard | To | Expected side effects | Source |
| --- | --- | --- | --- | --- | --- |
| T1 | `DRAFT` | submit, all 4 gates pass | `UNDER_REVIEW` (via `SUBMITTED`) | Caller never sees `SUBMITTED`; response/GET shows `UNDER_REVIEW` | L31, L32, L51 |
| T2 | `DRAFT` | submit, a gate fails | `REJECTED` (via `SUBMITTED`) | `failing_gate` and `rejection_reason` populated | L31, L33, L54 |
| T3 | `UNDER_REVIEW` | approve (reviewer) | `APPROVED` | A `ReviewAction` row written | L34 |
| T4 | `UNDER_REVIEW` | reject (reviewer, note given) | `REJECTED` | `failing_gate`/`rejection_reason` populated (L54) | L35, L54 |
| T5 | `APPROVED` | complete (maintenance endpoint) | `COMPLETED` | Never set from elapsed time | L36, L56 |
| T6 | `DRAFT` | cancel | `CANCELLED` | - | L37 |
| T7 | `SUBMITTED` | cancel | `CANCELLED` | Only in the window before gates resolve; not reliably reachable by a caller | L38 |
| T8 | `UNDER_REVIEW` | cancel | `CANCELLED` | - | L39 |
| T9 | `APPROVED` | cancel, now <= `window_start` - 2h | `CANCELLED` | - | L40, L60-62 |
| T10 | `APPROVED` | cancel, now > `window_start` - 2h | stays `APPROVED` | `409` (state-transition error, not a gate failure) | L60-63 |

Every state change (T1-T9) should also produce an audit log entry (L74-78; implementation note, test as a secondary observation, not a requirement-level expected result).

---

## 3. Full state x action matrix (valid and invalid)

Caller-invoked actions only (E2/E3 are not invocable, L32). `SUBMITTED` row is mostly untestable from outside because the state is never observed at rest (L51).

| From \ Action | submit | approve | reject | complete | cancel |
| --- | --- | --- | --- | --- | --- |
| `DRAFT` | **T1 / T2** | 409 (N1) | 409 (N2) | 409 (N3) | **T6** |
| `SUBMITTED` | 409 (N4)* | 409 (N5)* | 409 (N6)* | 409 (N7)* | **T7*** |
| `UNDER_REVIEW` | 409 (N8) - explicitly named, L5-6, L27, L43 | **T3** | **T4** | 409 (N9) | **T8** |
| `APPROVED` | 409 (N10) | 409 (N11) | 409 (N12) | **T5** | **T9 / T10** |
| `REJECTED` | 409 (N13) | 409 (N14) | 409 (N15) | 409 (N16) | 409 (N17) |
| `CANCELLED` | 409 (N18) | 409 (N19) | 409 (N20) | 409 (N21) | 409 (N22) |
| `COMPLETED` | 409 (N23) | 409 (N24) | 409 (N25) | 409 (N26) | 409 (N27) |

`*` = cannot be set up by a black-box caller (see Unknowns U1).

Count: 35 cells = 8 valid cells (10 transitions incl. guarded variants) + 27 invalid pairs. Black-box testable invalid pairs: 23 (excluding the 4 `SUBMITTED` cells).

### 3.1 Invalid-transition test conditions

For each N#: put the request in the From state, call the action, expect `409`, then GET and expect the state unchanged (and no `ReviewAction` / audit row for approve/reject).

Priority hints:
- High: N8 (`submit` from `UNDER_REVIEW`, called out three times in the spec), N13 (re-submit a `REJECTED` request), N17/N22/N27 (cancel a terminal request), N16 (complete a `REJECTED` request), N3 (complete a `DRAFT`), N1 (approve a `DRAFT`, skipping gates).
- Medium: remaining terminal-state cells, N10-N12.

How to reach each From state:
- `DRAFT`: create.
- `UNDER_REVIEW`: create + submit (gates pass).
- `APPROVED`: ... + approve.
- `REJECTED`: (a) submit with a failing gate, or (b) reviewer reject. Both routes should be covered for at least N13 since the terminal state is reached two ways.
- `CANCELLED`: cancel from `DRAFT`, `UNDER_REVIEW` or `APPROVED` (vary the route for at least N22).
- `COMPLETED`: ... + approve + complete.

---

## 4. Transition sequences (1-switch / end-to-end paths)

| P# | Path | Purpose |
| --- | --- | --- |
| P1 | DRAFT -submit(pass)-> UNDER_REVIEW -approve-> APPROVED -complete-> COMPLETED | Happy path to terminal |
| P2 | DRAFT -submit(fail)-> REJECTED -submit-> 409 | Gate rejection is terminal |
| P3 | DRAFT -submit(pass)-> UNDER_REVIEW -reject-> REJECTED -submit-> 409 | Reviewer rejection is terminal |
| P4 | DRAFT -submit(pass)-> UNDER_REVIEW -submit-> 409 (still UNDER_REVIEW) | Re-submit guard |
| P5 | DRAFT -cancel-> CANCELLED -submit-> 409 | Cancelled draft cannot be revived |
| P6 | ... UNDER_REVIEW -cancel-> CANCELLED -approve-> 409 | Reviewer cannot approve a withdrawn request |
| P7 | ... APPROVED -cancel(>=2h ahead)-> CANCELLED -complete-> 409 | Cancelled approval cannot be completed |
| P8 | ... APPROVED -complete-> COMPLETED -cancel-> 409 | Completed is terminal |
| P9 | ... APPROVED -cancel(<2h ahead)-> 409, then complete -> COMPLETED | Late cancel leaves request usable |
| P10 | ... UNDER_REVIEW -approve-> APPROVED -approve-> 409 | Double approval |
| P11 | ... UNDER_REVIEW -approve-> APPROVED, then wait past window end, GET -> still APPROVED | COMPLETED never inferred from time (L36, L56) |

---

## 5. Equivalence partitions

### EP-1 Gate outcome on submit (L31-33, L51)
| Class | Input | Expected |
| --- | --- | --- |
| EP-1.1 valid | All four gates pass | `UNDER_REVIEW` |
| EP-1.2 invalid | Exactly one gate fails (one class per gate; gate names not listed in this spec except `AIRCRAFT`, `TIME_WINDOW`) | `REJECTED`, `failing_gate` = that gate, `rejection_reason` set |
| EP-1.3 invalid | Several gates would fail | `REJECTED`, `failing_gate` = ? (see U5) |
| EP-1.4 | Any submit outcome | State observed after the call is never `SUBMITTED` |

### EP-2 Caller identity per action (L34-35, L36, L37-40)
| Action | Valid class | Invalid classes |
| --- | --- | --- |
| approve / reject | Reviewer (`X-Reviewer-Id`) | Operator session; no identity; both (U3) |
| cancel | Operator (owner) | Reviewer; other operator (U3) |
| complete | Maintenance endpoint caller | Operator; reviewer (U3) |

Expected status for invalid identities is not stated in this spec (U3).

### EP-3 Reject `note` (L35)
| Class | Value | Expected |
| --- | --- | --- |
| EP-3.1 valid | Non-empty note | `REJECTED` |
| EP-3.2 invalid | Note missing | Refused, state stays `UNDER_REVIEW` (code: U4) |
| EP-3.3 invalid | Empty string | Refused (assumed; U4) |
| EP-3.4 invalid | Whitespace only | Unknown (U4) |

### EP-4 Cancel of `APPROVED` vs time to `window_start` (L40, L60-63)
| Class | Time remaining `window_start - now` | Expected |
| --- | --- | --- |
| EP-4.1 valid | > 2h (far ahead, e.g. 1 day) | `CANCELLED` |
| EP-4.2 invalid | > 0 and < 2h | `409`, stays `APPROVED` |
| EP-4.3 invalid | <= 0 (window already started / passed, not completed) | `409` (follows from "closer than that") |

The deadline guard applies only to `APPROVED`; cancel from `DRAFT`/`UNDER_REVIEW` with `window_start` < 2h away should still succeed (EP-4.4, inferred from L37, L39 having no guard).

### EP-5 Aircraft schedule overlap - state of the other request (L65-70)
Other request: same aircraft, overlapping window.
| Class | Other request state | Counted by overlap check? | Expected for submit of the new request |
| --- | --- | --- | --- |
| EP-5.1 | `UNDER_REVIEW` | yes | `REJECTED` (overlap gate fails) |
| EP-5.2 | `APPROVED` | yes | `REJECTED` |
| EP-5.3 | `DRAFT` | no | not blocked by overlap |
| EP-5.4 | `REJECTED` | no | not blocked |
| EP-5.5 | `CANCELLED` | no | not blocked |
| EP-5.6 | `COMPLETED` | no | not blocked |
| EP-5.7 | `SUBMITTED` | unspecified (U6) | - |

Plus: EP-5.8 validate passes, then another request for the same aircraft is approved, then submit -> `REJECTED` (L68-70, expected behavior).
Non-overlap control: same aircraft, non-overlapping window, other in `APPROVED` -> not blocked (window adjacency boundary: U7).

---

## 6. Boundary values

### BVA-1 Cancellation deadline for `APPROVED` (L40, L60-62)
Boundary: `now = window_start - 2h`. "Up to 2 hours before" read as inclusive (allowed at exactly 2h), see U2.

| B# | `window_start - now` | Expected |
| --- | --- | --- |
| B1 | 2h + 1 min (or +1 s at the system's precision) | `CANCELLED` |
| B2 | exactly 2h 00m 00s | `CANCELLED` (if inclusive, U2) |
| B3 | 2h - 1 min (or -1 s) | `409`, stays `APPROVED` |
| B4 | 0 (at `window_start`) | `409` |
| B5 | negative (after `window_start`) | `409` |

### BVA-2 Overlap windows (L65-70)
Not specified in this file (edge touching: new window starts exactly when the other ends). Listed as U7, not designed.

---

## 7. Unknowns / questions (not guessed)

| U# | Topic | Why it matters |
| --- | --- | --- |
| U1 | `SUBMITTED` is never observable (L31, L51) yet `SUBMITTED -> cancel` is legal (L38). How can it be tested? Needs a test hook, concurrency, or is effectively unreachable. N4-N7 are also untestable black-box. | T7 / N4-N7 coverage |
| U2 | "Up to 2 hours before `window_start`": is exactly 2h allowed? Time precision (seconds/ms)? Server clock and timezone? | B2 expected result |
| U3 | Status code when the wrong actor calls approve/reject/complete/cancel (401/403 vs 409)? Can an operator cancel another operator's request? Who may call the maintenance endpoint? | EP-2 |
| U4 | Status code and exact rule for a missing/empty/whitespace `note` on reject (400/422 vs 409). | EP-3 |
| U5 | When several gates fail, which `failing_gate` is reported (gate order)? The four gates are not named in this file. | EP-1.3 |
| U6 | Does the overlap check count a concurrently `SUBMITTED` request (race between two submits)? | EP-5.7 |
| U7 | Overlap definition: are touching windows (end == start) overlapping? | BVA-2 |
| U8 | For reviewer reject, what goes into `failing_gate` (L54 says it is populated for any `REJECTED`)? | T4 expected fields |
| U9 | Does an illegal transition 409 body carry a specific error code/message? | N1-N27 assertions |
| U10 | Is there an "edit DRAFT" or `validate` action, and is it legal in non-DRAFT states? Not in this file (validate mentioned only at L68). | Matrix completeness |
| U11 | Should `APPROVED` past `window_end` without completion be cancellable/completable? Only "never inferred from elapsed time" is stated. | P11, EP-4.3 |

---

## 8. Coverage summary

- States: 7 (6 black-box reachable at rest).
- Valid transitions: 10 (T1-T10, incl. guarded `APPROVED` cancel pair) - all-transitions coverage.
- Invalid pairs: 27 (23 black-box testable).
- Paths: 11 (P1-P11).
- Partitions: EP-1 to EP-5 (27 classes).
- Boundaries: BVA-1 (5 values); BVA-2 deferred.
- Open questions: 11.
