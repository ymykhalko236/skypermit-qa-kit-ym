# Test Design: Request Lifecycle (`02-state-machine.md`)

Source: `02-state-machine.md` (copy in this folder). Line numbers (`Lnn`) refer to that file.
Techniques: state transition testing (full state × action matrix, valid paths, invalid pairs), equivalence partitioning, boundary value analysis.
Anything the spec does not state is listed under **Open questions** rather than given an invented expected result.

---

## 1. Model

**States (7)** — L48–56

| State | Terminal | Observable at rest? |
| --- | --- | --- |
| `DRAFT` | no | yes |
| `SUBMITTED` | no | **no** — transient, "should never be observed sitting in `SUBMITTED`" (L51) |
| `UNDER_REVIEW` | no | yes |
| `APPROVED` | no | yes |
| `REJECTED` | yes | yes |
| `CANCELLED` | yes | yes |
| `COMPLETED` | yes | yes |

**Caller-invoked actions (5):** `submit`, `approve`, `reject`, `complete`, `cancel`.
**Automatic events (2):** `gates pass`, `gates fail` — only from `SUBMITTED`, only as part of the submit call (L32–33).

**Default rule:** "Any `(from, action)` pair not listed here is illegal and must return `409`" (L24–27, L42–44).

---

## 2. Full state transition table (state × action)

Legend: **V** = valid transition, **409** = illegal pair, expected `409`.

| From \ Action | submit | approve | reject | complete | cancel |
| --- | --- | --- | --- | --- | --- |
| `DRAFT` | **V** → `UNDER_REVIEW` (gates pass) / `REJECTED` (gate fails) | 409 | 409 | 409 | **V** → `CANCELLED` |
| `SUBMITTED` ¹ | 409 | 409 | 409 | 409 | **V** → `CANCELLED` ¹ |
| `UNDER_REVIEW` | 409 (explicit example, L5–6, L27) | **V** → `APPROVED` (reviewer only) | **V** → `REJECTED` (reviewer only, `note` required) | 409 | **V** → `CANCELLED` |
| `APPROVED` | 409 | 409 | 409 ² | **V** → `COMPLETED` (maintenance endpoint only) | **V** → `CANCELLED` only if ≥ 2 h before `window_start`; otherwise 409 (see §4) |
| `REJECTED` | 409 | 409 | 409 | 409 | 409 |
| `CANCELLED` | 409 | 409 | 409 | 409 | 409 |
| `COMPLETED` | 409 | 409 | 409 | 409 | 409 |

Totals: 35 cells — 8 valid (`APPROVED`+cancel conditional), 27 illegal (`409`).

¹ `SUBMITTED` cannot be held at rest by a caller (L31, L51), so its row is not reachable through the public API under normal conditions. See Q1.
² The ASCII diagram (L11) draws the `reject` arrow so that its right end sits between `UNDER_REVIEW` and `APPROVED`; the table (L35) lists only `UNDER_REVIEW` → reject. The table is treated as authoritative ("this table is the same information", L23–24); `APPROVED`+reject → 409. See Q2.

### 2.1 Valid transitions (one test condition each)

| ID | From | Action / event | To | Additional expected effects (from spec) | Source |
| --- | --- | --- | --- | --- | --- |
| ST-V01 | `DRAFT` | submit, all gates pass | `UNDER_REVIEW` | `SUBMITTED` never observed by caller | L31–32 |
| ST-V02 | `DRAFT` | submit, a gate fails | `REJECTED` | `failing_gate` and `rejection_reason` populated | L31, L33, L54 |
| ST-V03 | `UNDER_REVIEW` | approve (with `X-Reviewer-Id`) | `APPROVED` | a `ReviewAction` row is written | L34 |
| ST-V04 | `UNDER_REVIEW` | reject (reviewer, with `note`) | `REJECTED` | `rejection_reason` populated (L54) | L35 |
| ST-V05 | `APPROVED` | complete (maintenance endpoint) | `COMPLETED` | — | L36, L56 |
| ST-V06 | `DRAFT` | cancel (operator) | `CANCELLED` | — | L37 |
| ST-V07 | `SUBMITTED` | cancel (operator) | `CANCELLED` | only in the window before gates resolve | L38 — see Q1 |
| ST-V08 | `UNDER_REVIEW` | cancel (operator) | `CANCELLED` | — | L39 |
| ST-V09 | `APPROVED` | cancel (operator), ≥ 2 h before `window_start` | `CANCELLED` | — | L40, L60–64 |

### 2.2 Invalid transitions (expected `409`)

Each `409` cell in the matrix is one test condition. Grouped:

| ID | From | Actions | Count | Note |
| --- | --- | --- | --- | --- |
| ST-I01 | `DRAFT` | approve, reject, complete | 3 | |
| ST-I02 | `SUBMITTED` | submit, approve, reject, complete | 4 | not reachable at rest — Q1 |
| ST-I03 | `UNDER_REVIEW` | submit, complete | 2 | submit is the spec's own example (L5–6) — high priority |
| ST-I04 | `APPROVED` | submit, approve, reject | 3 | reject — Q2 |
| ST-I05 | `APPROVED` | cancel < 2 h before `window_start` | 1 | conditional 409 (L62) — see §4 |
| ST-I06 | `REJECTED` | submit, approve, reject, complete, cancel | 5 | terminal; resubmit after rejection is a high-risk case |
| ST-I07 | `CANCELLED` | submit, approve, reject, complete, cancel | 5 | terminal |
| ST-I08 | `COMPLETED` | submit, approve, reject, complete, cancel | 5 | terminal |

For every illegal pair, also check that the state is unchanged afterwards (Q5) and that no audit / `ReviewAction` row is written.

### 2.3 Path coverage (0-switch / 1-switch sequences)

| ID | Sequence | End state |
| --- | --- | --- |
| P-01 | create → submit (pass) → approve → complete | `COMPLETED` |
| P-02 | create → submit (pass) → reject | `REJECTED` |
| P-03 | create → submit (fail) | `REJECTED` |
| P-04 | create → cancel | `CANCELLED` |
| P-05 | create → submit (pass) → cancel | `CANCELLED` |
| P-06 | create → submit (pass) → approve → cancel (≥ 2 h before) | `CANCELLED` |
| P-07 | P-02 / P-03 → submit again | 409, stays `REJECTED` |
| P-08 | P-05 → cancel again | 409, stays `CANCELLED` |
| P-09 | P-01 → complete again | 409, stays `COMPLETED` |
| P-10 | create → submit (pass) → submit | 409, stays `UNDER_REVIEW` |
| P-11 | create → submit (pass) → approve → approve | 409, stays `APPROVED` |

---

## 3. Equivalence partitions

| ID | Input / condition | Valid partitions | Invalid partitions | Source |
| --- | --- | --- | --- | --- |
| EP-01 | Current state for `submit` | `DRAFT` | `UNDER_REVIEW`, `APPROVED`, `REJECTED`, `CANCELLED`, `COMPLETED` | L29–44 |
| EP-02 | Current state for `approve` / `reject` | `UNDER_REVIEW` | all other states | L34–35 |
| EP-03 | Current state for `complete` | `APPROVED` | all other states | L36 |
| EP-04 | Current state for `cancel` | `DRAFT`, `UNDER_REVIEW`, `APPROVED` (before deadline), (`SUBMITTED`) | `APPROVED` (after deadline), `REJECTED`, `CANCELLED`, `COMPLETED` | L37–42 |
| EP-05 | Gate outcome on submit | all four gates pass → `UNDER_REVIEW` | any gate fails → `REJECTED` | L31–33, L51 |
| EP-06 | Caller identity for approve / reject | reviewer (`X-Reviewer-Id`) | operator / no reviewer id — expected code **not stated** (Q3) | L34–35 |
| EP-07 | Caller identity for cancel | operator | reviewer — expected result not stated (Q3) | L37–40 |
| EP-08 | Route for complete | maintenance endpoint | any other route / elapsed time passing `window_end` → must **not** become `COMPLETED` | L36, L56 |
| EP-09 | `note` on reject | present, non-empty | missing; empty / whitespace — expected code not stated (Q4) | L35 |
| EP-10 | Other requests' states in overlap check (same aircraft, overlapping window) | counted: `APPROVED`, `UNDER_REVIEW` | ignored: `DRAFT`, `REJECTED`, `CANCELLED`, `COMPLETED` | L65–68 |
| EP-11 | Overlap between `validate` and `submit` | no conflicting request appears → submit result matches validate | conflicting request approved in between → submit fails at `AIRCRAFT`/`TIME_WINDOW` gate even though validate passed (expected behaviour) | L68–70 |

EP-10 yields one condition per state of the "other" request: 2 that must cause a gate failure, 4 that must not. `SUBMITTED` is not listed in either group (Q6).

---

## 4. Boundary values

### BVA-01 Cancellation deadline for `APPROVED` (L40, L60–64)

Rule: cancel allowed "**up to 2 hours before `window_start`**"; closer than that → `409`.
Let `t = window_start − now` at the time of the cancel call.

| ID | `t` | Expected |
| --- | --- | --- |
| BVA-01a | well above 2 h (e.g. 24 h) | `CANCELLED` |
| BVA-01b | 2 h + 1 smallest unit | `CANCELLED` |
| BVA-01c | exactly 2 h | **not stated** — "up to" suggests allowed, but unconfirmed (Q7) |
| BVA-01d | 2 h − 1 smallest unit | `409`, stays `APPROVED` |
| BVA-01e | 0 (at `window_start`) | `409` |
| BVA-01f | negative (window already started / passed, not completed) | `409` (closer than 2 h) |

"Smallest unit" (second vs minute) and the time zone / clock used for `now` are not stated (Q7).
The deadline applies to `APPROVED` only; `DRAFT` and `UNDER_REVIEW` cancel at `t` < 2 h has no stated restriction (Q8) — add one check each at `t = 1 h` to make the behaviour visible.

### BVA-02 Completion is not time-driven (L36, L56)

| ID | Condition | Expected |
| --- | --- | --- |
| BVA-02a | `APPROVED` request, `window_end` passed, no maintenance call | still `APPROVED` |
| BVA-02b | same, then maintenance complete call | `COMPLETED` |

### BVA-03 Overlap edges (L65–68)

The spec says only "overlap"; whether windows that touch (one ends exactly when the other starts) count as overlapping is not stated here (Q9). Candidate values once defined: end = start − 1 unit, end = start, end = start + 1 unit.

---

## 5. Other test conditions from the spec

| ID | Condition | Source |
| --- | --- | --- |
| OC-01 | After any submit, a GET never returns `state = SUBMITTED` | L31, L51 |
| OC-02 | Rejected via gate: `failing_gate` and `rejection_reason` populated | L33, L54 |
| OC-03 | Approve writes exactly one `ReviewAction` row | L34 |
| OC-04 | Every state change is logged (DB trigger), including cancel and complete | L74–78 |
| OC-05 | Illegal-transition `409` is not a gate failure — no `failing_gate` / `REJECTED` result (stated for the deadline case) | L62–63 |

---

## 6. Open questions (not guessed)

| ID | Question | Lines |
| --- | --- | --- |
| Q1 | `SUBMITTED` + cancel is listed as valid but "caller never observes `SUBMITTED` at rest" and gates run synchronously. Is ST-V07 (and the whole `SUBMITTED` row) testable at all, or only by concurrency / DB seeding? | L31, L38, L51 |
| Q2 | Diagram's `reject` arrow ends near `APPROVED`; table lists reject from `UNDER_REVIEW` only. Confirm `APPROVED` + reject = `409`. Also the prose (L18–19) lists only `DRAFT`, `SUBMITTED`, `UNDER_REVIEW` as reaching `CANCELLED`, omitting `APPROVED` which the table allows. | L11, L18–19, L35, L40 |
| Q3 | Expected status when the wrong role calls approve / reject (no `X-Reviewer-Id`) or when a reviewer calls cancel — 401/403/409? And which check wins when both role and state are wrong? | L34–40 |
| Q4 | Expected status and message when reject has no / empty `note`. | L35 |
| Q5 | Spec says illegal pairs "return `409`" but not explicitly that state and audit log are untouched. Assumed; confirm. | L4, L42–44 |
| Q6 | Is a `SUBMITTED` request counted by the overlap check (two concurrent submits for the same aircraft)? | L65–68 |
| Q7 | Cancellation deadline: is exactly 2 h allowed? Time granularity and clock/time zone used? | L40, L60–62 |
| Q8 | Does any deadline apply to cancelling `DRAFT` / `UNDER_REVIEW` close to or after `window_start`? | L37, L39 |
| Q9 | Do touching windows count as overlapping? (Not defined in this file.) | L65–68 |
| Q10 | For a reviewer reject, what is `failing_gate` set to? L54 says both fields are populated for every `REJECTED`. | L35, L54 |
| Q11 | Does reject also write a `ReviewAction` row (only approve is stated)? | L34–35 |
| Q12 | Behaviour for a non-existent request id (404 vs 409) is not covered here. | — |
