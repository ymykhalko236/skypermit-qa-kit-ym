# Test Design: Request Lifecycle (`02-state-machine.md`)

Source: `02-state-machine.md` (this folder). Line numbers (`L<n>`) refer to that file.
Techniques: state transition testing (full state × event table), equivalence partitioning, boundary value analysis.
Anything the spec does not state is listed under **Unknowns** rather than given an invented expected result.

---

## 1. Model

### 1.1 States (L48–L56)

| ID | State | Terminal | Observable at rest |
| --- | --- | --- | --- |
| S1 | `DRAFT` | no | yes |
| S2 | `SUBMITTED` | no | **no** — transient, "a request should never be observed sitting in `SUBMITTED`" (L51) |
| S3 | `UNDER_REVIEW` | no | yes |
| S4 | `APPROVED` | no | yes |
| S5 | `REJECTED` | **yes** | yes |
| S6 | `CANCELLED` | **yes** | yes |
| S7 | `COMPLETED` | **yes** | yes |

### 1.2 Events

| ID | Event | Caller | Source |
| --- | --- | --- | --- |
| E1 | `submit` | operator | L31 |
| E2 | `approve` | reviewer only (`X-Reviewer-Id`) | L34 |
| E3 | `reject` (with `note`) | reviewer only | L35 |
| E4 | `complete` | maintenance endpoint only | L36, L56 |
| E5 | `cancel` | operator | L37–L40 |
| A1 | gates pass (automatic) | system, inside `submit` | L32 |
| A2 | gates fail (automatic) | system, inside `submit` | L33 |

A1/A2 are not caller-invoked; they are the outcome of E1 and are tested through E1.

### 1.3 Guards

| ID | Guard | Applies to | Source |
| --- | --- | --- | --- |
| G1 | all four gates pass | `SUBMITTED` → `UNDER_REVIEW` | L20, L32, L51 |
| G2 | at least one gate fails | `SUBMITTED` → `REJECTED` | L20, L33 |
| G3 | caller is a reviewer (`X-Reviewer-Id`) | approve, reject | L34–L35 |
| G4 | `note` is supplied | reject | L35 |
| G5 | now ≤ `window_start` − 2 h | cancel from `APPROVED` | L40, L60–L64 |

---

## 2. Full state transition table (7 states × 5 caller events = 35 cells)

Legend: **V** = valid transition, **X** = invalid, expected `409` and state unchanged (L4, L24–L27, L42–L44).

| From \ Event | submit (E1) | approve (E2) | reject (E3) | complete (E4) | cancel (E5) |
| --- | --- | --- | --- | --- | --- |
| `DRAFT` | **V** T1/T2 → `UNDER_REVIEW` or `REJECTED` | X N1 | X N2 | X N3 | **V** T6 → `CANCELLED` |
| `SUBMITTED`* | X N4* | X N5* | X N6* | X N7* | **V** T7* → `CANCELLED` |
| `UNDER_REVIEW` | X N8 (named example, L5, L26) | **V** T3 → `APPROVED` | **V** T4 → `REJECTED` | X N9 | **V** T8 → `CANCELLED` |
| `APPROVED` | X N10 | X N11 | X N12 | **V** T5 → `COMPLETED` | **V** T9 → `CANCELLED` if G5; else X N13 (`409`, L62) |
| `REJECTED` | X N14 | X N15 | X N16 | X N17 | X N18 |
| `CANCELLED` | X N19 | X N20 | X N21 | X N22 | X N23 |
| `COMPLETED` | X N24 | X N25 | X N26 | X N27 | X N28 |

\* `SUBMITTED` row: cannot be set up through the public interface, because submit resolves synchronously (L31, L51). See U1.

Totals: 8 valid cells (9 valid transitions counting the two submit outcomes), 27 invalid cells, plus the guarded-invalid N13.

### 2.1 Valid transitions (0-switch coverage)

| TC | From | Event / guard | To | Additional expected results | Source |
| --- | --- | --- | --- | --- | --- |
| T1 | `DRAFT` | submit, G1 (all gates pass) | `UNDER_REVIEW` | Response/GET never shows `SUBMITTED` | L31–L32, L51 |
| T2 | `DRAFT` | submit, G2 (a gate fails) | `REJECTED` | `failing_gate` and `rejection_reason` populated | L31, L33, L54 |
| T3 | `UNDER_REVIEW` | approve, G3 | `APPROVED` | A `ReviewAction` row is written | L34 |
| T4 | `UNDER_REVIEW` | reject, G3 + G4 | `REJECTED` | `rejection_reason` populated (see U6 for `failing_gate`) | L35, L54 |
| T5 | `APPROVED` | complete (maintenance endpoint) | `COMPLETED` | — | L36, L56 |
| T6 | `DRAFT` | cancel | `CANCELLED` | — | L37 |
| T7 | `SUBMITTED` | cancel | `CANCELLED` | **Not executable black-box** (U1) | L38 |
| T8 | `UNDER_REVIEW` | cancel | `CANCELLED` | — | L39 |
| T9 | `APPROVED` | cancel, G5 holds | `CANCELLED` | — | L40, L60–L61 |

Every valid transition should also produce a state-change audit entry (L74–L78). Every invalid one (N1–N28) must leave the state and audit log unchanged.

### 2.2 Invalid transitions (negative tests)

Each of N1–N28 is one atomic check: put the request in the "From" state, send the event, expect `409`, then read the request back and confirm the state is unchanged. Priority:

- **High:** N8 (re-submit while `UNDER_REVIEW`, the spec's own example), N13 (cancel inside 2 h), N10 (re-submit `APPROVED`), N11 (re-approve), N14/N19/N24 (re-submit a terminal request), N18/N23/N28 (cancel a terminal request), N17 (complete a `REJECTED` request), N1/N2 (review a `DRAFT`), N3 (complete a `DRAFT`), N9 (complete before approval).
- **Medium:** remaining terminal-state cells N15, N16, N20–N22, N25–N27; N12 (reject after approval).
- **Not executable:** N4–N7 (`SUBMITTED` cannot be held, U1).

### 2.3 Paths (1-switch / end-to-end sequences)

| Path | Sequence | End state |
| --- | --- | --- |
| P1 | `DRAFT` –submit(pass)→ `UNDER_REVIEW` –approve→ `APPROVED` –complete→ `COMPLETED` | `COMPLETED` |
| P2 | `DRAFT` –submit(fail)→ `REJECTED` –submit→ `409` | `REJECTED` |
| P3 | `DRAFT` –submit(pass)→ `UNDER_REVIEW` –reject→ `REJECTED` –approve→ `409` | `REJECTED` |
| P4 | `DRAFT` –cancel→ `CANCELLED` –submit→ `409` | `CANCELLED` |
| P5 | `DRAFT` –submit(pass)→ `UNDER_REVIEW` –cancel→ `CANCELLED` –approve→ `409` | `CANCELLED` |
| P6 | `DRAFT` –submit(pass)→ `UNDER_REVIEW` –approve→ `APPROVED` –cancel (> 2 h)→ `CANCELLED` –complete→ `409` | `CANCELLED` |
| P7 | `DRAFT` –submit(pass)→ `UNDER_REVIEW` –submit→ `409` –approve→ `APPROVED` | `APPROVED` (rejected call had no side effect) |
| P8 | … `APPROVED` –cancel (< 2 h)→ `409` –complete→ `COMPLETED` | `COMPLETED` |
| P9 | … `APPROVED` –complete→ `COMPLETED` –cancel→ `409` | `COMPLETED` |
| P10 | … `APPROVED` –approve→ `409` (double approval; no second `ReviewAction` row) | `APPROVED` |

---

## 3. Equivalence partitions

### EP-1 Source state for each event

| Event | Valid partition | Invalid partition (`409`) |
| --- | --- | --- |
| submit | {`DRAFT`} | {`UNDER_REVIEW`, `APPROVED`, `REJECTED`, `CANCELLED`, `COMPLETED`} |
| approve | {`UNDER_REVIEW`} | {`DRAFT`, `APPROVED`, `REJECTED`, `CANCELLED`, `COMPLETED`} |
| reject | {`UNDER_REVIEW`} | {`DRAFT`, `APPROVED`, `REJECTED`, `CANCELLED`, `COMPLETED`} |
| complete | {`APPROVED`} | {`DRAFT`, `UNDER_REVIEW`, `REJECTED`, `CANCELLED`, `COMPLETED`} |
| cancel | {`DRAFT`, `UNDER_REVIEW`, `APPROVED` with G5} | {`APPROVED` without G5, `REJECTED`, `CANCELLED`, `COMPLETED`} |

(Section 2 tests every member, so this is fully covered by the table.)

### EP-2 Terminal vs non-terminal states

- Terminal {`REJECTED`, `CANCELLED`, `COMPLETED`}: every event → `409` (L42–L43).
- Non-terminal {`DRAFT`, `UNDER_REVIEW`, `APPROVED`}: at least one event is valid.

### EP-3 Gate outcome on submit

| Partition | Expected | Source |
| --- | --- | --- |
| All four gates pass | `UNDER_REVIEW` | L32, L51 |
| One or more gates fail | `REJECTED`, `failing_gate` + `rejection_reason` populated | L33, L54 |

The individual gates and their rules are defined elsewhere (not in this spec), so one representative failing gate is enough here.

### EP-4 Caller role for approve / reject

| Partition | Expected | Source |
| --- | --- | --- |
| Reviewer (`X-Reviewer-Id` supplied) | Transition allowed (if state valid) | L34–L35 |
| Operator session, no reviewer ID | Refused — status code **not specified** (U3) | L34 |
| No credentials | Refused — status code **not specified** (U3) | — |

### EP-5 `note` on reject

| Partition | Expected | Source |
| --- | --- | --- |
| Non-empty note | `REJECTED` | L35 |
| Note missing | Refused, state stays `UNDER_REVIEW` — status code **not specified** (U4) | L35 |
| Empty string / whitespace only | **Not specified** whether this counts as "required" being met (U4) | — |

### EP-6 Who completes

| Partition | Expected | Source |
| --- | --- | --- |
| Maintenance completion endpoint | `APPROVED` → `COMPLETED` | L36, L56 |
| Elapsed time only (`window_end` passed, no call) | Request stays `APPROVED`; never auto-`COMPLETED` | L36, L56 |

### EP-7 States counted by the aircraft overlap check (L65–L70)

| Partition | States | Expected effect on a new submit for the same aircraft and an overlapping window |
| --- | --- | --- |
| Counted | `APPROVED`, `UNDER_REVIEW` | Overlap → the new request is `REJECTED` by the `AIRCRAFT` / `TIME_WINDOW` gate |
| Invisible | `DRAFT`, `REJECTED`, `CANCELLED`, `COMPLETED` | No overlap conflict; the new request can reach `UNDER_REVIEW` |

One test per state (6 tests). Plus the race scenario from L68–L70: request B passes `validate`; request A for the same aircraft is approved; B is then submitted → `REJECTED` (expected behaviour, not a bug).

### EP-8 Cancellation time relative to `window_start` (request in `APPROVED`)

| Partition | Expected | Source |
| --- | --- | --- |
| now < `window_start` − 2 h | `CANCELLED` | L40, L60–L61 |
| `window_start` − 2 h < now < `window_start` | `409`, stays `APPROVED` | L61–L63 |
| now ≥ `window_start` (window started or over) | `409` (it is "closer than" 2 h) — implied, not stated explicitly (U9) | L61–L62 |

The deadline applies only to `APPROVED`. `DRAFT` and `UNDER_REVIEW` cancels have no time restriction in this spec (U10).

---

## 4. Boundary values

### BVA-1 Cancellation deadline (`APPROVED` → `CANCELLED`)

Boundary: `window_start` − 2 h. Time resolution is not specified (U8); `ε` below is the smallest unit the system stores (e.g. 1 s or 1 min).

| ID | now = | Expected | Note |
| --- | --- | --- | --- |
| B1 | `window_start` − 2 h − ε | `CANCELLED` | Just inside the allowed range |
| B2 | `window_start` − 2 h exactly | **Unknown** — "up to 2 hours before" reads as inclusive (allowed), but this is not explicit (U7) | On the boundary |
| B3 | `window_start` − 2 h + ε | `409`, stays `APPROVED` | Just inside the refused range |
| B4 | `window_start` | `409` (U9) | Window start |
| B5 | after `window_start` (e.g. + 1 h) | `409` (U9) | Window running |

### BVA-2 Overlap check

The spec says only that overlapping requests are counted; it does not define overlap (e.g. whether windows that touch, `A.window_end` = `B.window_start`, overlap). No boundary values can be derived here (U11).

### BVA-3 Gates

"All four gates" (L51) — count boundary: 0 failing gates (pass) vs 1 failing gate (fail). Multiple failing gates: which one is reported in `failing_gate` is not specified (U5).

---

## 5. Cross-cutting checks

| ID | Check | Source |
| --- | --- | --- |
| C1 | After any invalid event, the request's state, `failing_gate`, `rejection_reason` and audit log are unchanged | L4, L74–L78 |
| C2 | Every valid transition writes exactly one state-change audit entry (from, to) | L74–L78 |
| C3 | No API response or GET ever returns `state = SUBMITTED` | L31, L51 |
| C4 | Approve writes one `ReviewAction` row; a refused (`409`) approve writes none | L34 |
| C5 | Cancel-deadline refusal is a `409` (state-transition error), **not** a gate failure: no `failing_gate`, state stays `APPROVED` | L62–L63 |

---

## 6. Unknowns and contradictions (do not guess expected results)

| ID | Issue | Lines | Impact |
| --- | --- | --- | --- |
| U1 | `SUBMITTED` → `CANCELLED` is listed as legal "in the narrow window before gates resolve", but submit is synchronous and `SUBMITTED` is never observable. Contradictory / not testable black-box. Is T7 reachable at all, and should N4–N7 be tested? | L31, L38, L51 | T7, N4–N7 blocked |
| U2 | The prose under the diagram lists only `DRAFT`, `SUBMITTED`, `UNDER_REVIEW` as reaching `CANCELLED`; the diagram and table also include `APPROVED`. Table taken as governing (L23–L24 says it is "the same information"), but the prose should be fixed. | L18–L19 vs L13, L40 | T9 — low risk |
| U3 | Status code when a non-reviewer calls approve/reject (and when a non-maintenance caller calls complete) is not given. Also: if both the role and the state are wrong, which error wins (`409` vs auth error)? Can a reviewer cancel? | L34–L37 | EP-4, EP-6 |
| U4 | Status code for reject without `note`; whether empty or whitespace-only note counts as missing. | L35 | EP-5 |
| U5 | With several failing gates, which gate is reported in `failing_gate` (first in order? all?). | L33, L54 | EP-3, BVA-3 |
| U6 | `REJECTED` says `failing_gate` and `rejection_reason` are populated, including for reviewer refusal; what `failing_gate` holds for a reviewer reject is not stated. Does reject also write a `ReviewAction` row (stated only for approve)? | L34–L35, L54 | T4 |
| U7 | Exactly 2 h before `window_start`: allowed or `409`? "Up to" suggests inclusive. | L40, L60–L61 | B2 |
| U8 | Time resolution and clock source (server time, time zone) for the deadline. | L60–L62 | BVA-1 ε |
| U9 | Cancel of `APPROVED` at or after `window_start` is not stated explicitly (only "closer than" 2 h). | L61–L62 | B4, B5 |
| U10 | Whether any deadline applies to cancelling `DRAFT` / `UNDER_REVIEW`. | L37, L39 | EP-8 |
| U11 | Definition of "overlap" (touching windows) and which gate (`AIRCRAFT` or `TIME_WINDOW`) reports it. | L65–L67 | EP-7, BVA-2 |
| U12 | The ASCII diagram's `reject` arrow ends under neither `UNDER_REVIEW` nor `APPROVED` cleanly (it could be misread as `APPROVED` → `REJECTED`). Table says reject is only from `UNDER_REVIEW`; N12 treats `APPROVED` + reject as `409`. | L11 vs L35 | N12 |
| U13 | Response for an unknown request ID, and for `validate` (mentioned at L68) — not part of this spec's transition set. | L68 | Out of scope |

---

## 7. Coverage summary

- States: 7/7; executable 6/7 (`SUBMITTED` blocked by U1).
- Valid transitions (0-switch): 9 (T1–T9); 8 executable.
- Invalid cells: 27 (N1–N12, N14–N28) + guarded N13; 23 + N13 executable.
- Paths: 10 (P1–P10).
- Partitions: EP-1 … EP-8. Boundaries: BVA-1 (5 values, 1 pending U7), BVA-3.
- Open items: 13 (U1–U13).
