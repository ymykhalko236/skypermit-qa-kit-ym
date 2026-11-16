# Test design: flight duration (TIME_WINDOW gate)

| | |
|---|---|
| **Rule** | Duration: 15–240 minutes, inclusive at both ends. `window_end` strictly after `window_start`. |
| **Source** | `06 - Business Rules` §1.4 `TIME_WINDOW` → Duration (`TSD-4` §3); `rule_reference` from §6: `TSD-4 §3` |
| **Related pages** | `01 - Data Model` (FlightRequest: `window_end` "must be after `window_start`"), `02 - State Machine`, `03 - API Contract` (endpoints 9–14, `422` body) |
| **Open questions / clarifications** | `05` and `07` say nothing about duration. Three new questions are raised in §6 below. |
| **Techniques** | Equivalence partitioning (EP), boundary value analysis (BVA, 2-value plus 3-value at the documented edges), state transition testing (0-switch coverage) |
| **Created** | 2026-11-16 |

---

## 1. Test item and model

- **Variable under test:** `d = window_end − window_start`, in minutes, computed in UTC.
- **Where it is checked:** the `TIME_WINDOW` gate, the 4th gate (`PILOT` → `AIRCRAFT` → `ZONE` → `TIME_WINDOW`). It runs from both `POST /flight-requests/{id}/validate` (dry run, no state change) and `POST /flight-requests/{id}/submit` (moves the request to `UNDER_REVIEW` or `REJECTED`).
- **Expected failure output** (`03 - API Contract`, `422` body):
  `failing_gate = TIME_WINDOW`, `rule_reference = "TSD-4 §3"`, `message` specific to duration.
- **Fixed once created:** there is no update endpoint for a flight request, so `d` can't change after `POST /flight-requests`. A request with an invalid duration can never become valid. Each test value needs its own request.

### Code observations (for information only; the docs are the oracle)

| Observation | Location |
|---|---|
| Gate computes `d` in fractional minutes and fails on `d < 15 \|\| d > 240` | `lib/gates/time-window-gate.ts:28-31` |
| Inside the gate, lead time and max advance are checked **before** duration; curfew and overlap **after** it | `lib/gates/time-window-gate.ts:20-66` |
| `window_end <= window_start` is refused at **create** with `400`, so it never reaches the gate | `app/api/v1/flight-requests/route.ts:38-40`; DB check `window_valid` in `supabase/migrations/0001_init.sql:148` |
| UI form uses `datetime-local` (minute precision by default) | `app/operator/requests/new/page.tsx:142,150` |

---

## 2. Isolating test data (shared preconditions)

Every other gate and every other `TIME_WINDOW` condition must pass, so that duration is the only variable:

| Item | Value | Why |
|---|---|---|
| Operator | Shared API operator `op-api-shared@test.example` (`L1`) | `api-automation/test-accounts.json` |
| Zone | `DNI-OPN-1` (`OPEN`, ceiling 120 m, `C0`–`C3`, `L1`, **no curfew**) | No curfew, so it can't mask the result; `L1` matches the operator |
| Pilot | `R_BASIC` or higher, `certified_on` ≤ 12 months before `window_start` | `PILOT` passes |
| Aircraft | `mtom_grams` = 800 (`C0`), new for each run | `AIRCRAFT` passes; no `APPROVED`/`UNDER_REVIEW` request of its own, so no overlap |
| Altitude | 100 m | ≤ 120 m ceiling |
| `window_start` | now + 2 days, on a whole minute | Lead time ≥ 6 h and ≤ 60 days. `window_end = window_start + d` |

---

## 3. Equivalence partitioning

| ID | Partition (`d`) | Valid? | Representative | Expected result |
|---|---|---|---|---|
| EP-1 | `d < 0` (end before start) | Invalid | −30 min | **TBC, see OQ-1.** Docs: refused (the rule needs end strictly after start). The code returns `400` at create, so no request exists |
| EP-2 | `d = 0` (end equals start) | Invalid | 0 min | **TBC, see OQ-1.** Same as EP-1 |
| EP-3 | `0 < d < 15` | Invalid | 5 min | `422`, `TIME_WINDOW`, `TSD-4 §3` |
| EP-4 | `15 ≤ d ≤ 240` | **Valid** | 120 min | `validate` → `200 {ok: true}` |
| EP-5 | `d > 240` | Invalid | 360 min | `422`, `TIME_WINDOW`, `TSD-4 §3` |
| EP-6 | `d` not a whole number of minutes | Unclear | 120 min 30 s | **TBC, see OQ-2** (only reachable through the API) |

EP-1 and EP-2 are one partition in the docs ("not after start"). They are split here because the zero point is a boundary of its own.

---

## 4. Boundary value analysis

Unit: 1 minute (the unit in the rule). Sub-minute values are in a separate row, waiting on OQ-2.

| ID | Boundary | `d` | Side | Expected | Covered today |
|---|---|---|---|---|---|
| BV-1 | end vs. start | 0 min | invalid | TBC (OQ-1) | – |
| BV-2 | end vs. start | 1 min | invalid (EP-3) | `422`, `TIME_WINDOW`, `TSD-4 §3` | – |
| BV-3 | lower | **14 min** | invalid | `422`, `TIME_WINDOW`, `TSD-4 §3` | UI: TC-CHK-005 |
| BV-4 | lower | **15 min** | valid | `200 {ok: true}` | UI: TC-CHK-007 |
| BV-5 | lower (3-value) | 16 min | valid | `200 {ok: true}` | – |
| BV-6 | upper (3-value) | 239 min | valid | `200 {ok: true}` | – |
| BV-7 | upper | **240 min** | valid | `200 {ok: true}` | UI: TC-CHK-009 |
| BV-8 | upper | **241 min** | invalid | `422`, `TIME_WINDOW`, `TSD-4 §3` | UI: TC-CHK-006 |
| BV-9 | lower, sub-minute | 14 min 59 s | ? | TBC (OQ-2). The code fails it | – |
| BV-10 | upper, sub-minute | 240 min 1 s | ? | TBC (OQ-2). The code fails it | – |

**Priority:** BV-3, BV-4, BV-7 and BV-8 are the minimum (2-value BVA). BV-5 and BV-6 are optional 3-value additions. Write BV-1, BV-2, BV-9 and BV-10 only after the open questions are answered.

---

## 5. State transition testing

Duration only affects the `DRAFT --submit-->` transition (and the dry-run `validate`). The model is limited to the states a duration-tested request can reach.

```
              validate (any d)  ── no state change
                 ┌───┐
                 ▼   │
 [create] ──► DRAFT ─┘
                 │ submit, d in 15..240  ──► UNDER_REVIEW ──submit──► 409
                 │ submit, d outside     ──► REJECTED     ──submit──► 409
                 │ cancel (any d)        ──► CANCELLED
```

### State table (duration events)

| From | Event / guard | To | Response | Source |
|---|---|---|---|---|
| DRAFT | validate, `d` invalid | DRAFT | `422` `TIME_WINDOW` `TSD-4 §3` | 03 endpoint 13 |
| DRAFT | validate, `d` valid | DRAFT | `200 {ok: true}` | 03 endpoint 13 |
| DRAFT | submit, `d` invalid | REJECTED | `422`; persisted `failing_gate = TIME_WINDOW`, `rule_reference = TSD-4 §3`, `rejection_reason` set | 02, 01 |
| DRAFT | submit, `d` valid | UNDER_REVIEW | `200`; `failing_gate`, `rule_reference` null | 02 |
| DRAFT | cancel, `d` invalid | CANCELLED | `200` (duration doesn't block cancel) | 02 |
| REJECTED | submit | REJECTED | `409` | 02 ("REJECTED → anything") |
| UNDER_REVIEW | submit | UNDER_REVIEW | `409` | 02 (re-submit example) |

### Transition test chains

| ID | Chain | Checks | Priority |
|---|---|---|---|
| ST-1 | Create DRAFT (`d` = 14) → `validate` → `validate` → `GET` | Both validates return the same `422` (duration doesn't depend on "now", unlike lead time); `GET` shows `DRAFT`, `failing_gate` null | High |
| ST-2 | Create DRAFT (`d` = 241) → `submit` → `GET` | `submit` `422` `TIME_WINDOW`/`TSD-4 §3`; `GET` shows `REJECTED` with the same `failing_gate`, `rule_reference` and a `rejection_reason` | High |
| ST-3 | ST-2 → `submit` again → `GET` | `409`; still `REJECTED`, fields unchanged | High |
| ST-4 | Create DRAFT (`d` = 15) → `submit` → `GET` | `200`, `UNDER_REVIEW`, gate fields null | High |
| ST-5 | ST-4 → `submit` again | `409`, still `UNDER_REVIEW` | Medium |
| ST-6 | Create DRAFT (`d` = 14) → `cancel` → `GET` | `CANCELLED`; no gate fields | Low |

Coverage: every row of the state table is exercised once (0-switch). ST-1 to ST-4 reuse BV-3, BV-8, BV-4 values, so boundary and state checks share test data.

---

## 6. Interactions with other rules

| ID | Combination | Expected | Basis |
|---|---|---|---|
| IX-1 | `d` = 14 **and** altitude 130 m (> 120 m ceiling) | `422`, `failing_gate = ZONE`, `ZC-2026.1 §2` (the first failing gate wins) | 06 "Evaluation order", 03 |
| IX-2 | `d` = 14 **and** window in curfew (e.g. `LVV-RST-2` 21:50–22:04 local) | **TBC, see OQ-3.** Both are `TIME_WINDOW`; docs don't say which `rule_reference` is returned | – |

---

## 7. Open questions (no expected result is assumed)

| ID | Question | Conflict |
|---|---|---|
| OQ-1 | When `window_end ≤ window_start`, is the expected result `422 TIME_WINDOW TSD-4 §3` at validate/submit, or `400` at `POST /flight-requests`? | 06 places "strictly after" under the `TIME_WINDOW` gate's Duration row; the code refuses it at create with `400` and the DB enforces it too, so the gate can't see it |
| OQ-2 | Is duration measured in whole minutes, or exactly? For example, is 240 min 30 s valid? | 06 says "15–240 minutes" without a precision; the code compares fractional minutes. Only the API can send seconds |
| OQ-3 | When several `TIME_WINDOW` conditions fail at once, which `rule_reference` is returned? | 06 orders the gates but not the conditions inside a gate. The code checks lead time → advance → duration → curfew → overlap |

---

## 8. Suggested test cases

| Design item | Level | Status |
|---|---|---|
| BV-3, BV-4, BV-7, BV-8 | UI | Exist: TC-CHK-005, -007, -009, -006 |
| BV-3, BV-4, BV-7, BV-8, EP-3, EP-4, EP-5 | API (`validate`) | To write with `api-test-case-creator` |
| BV-5, BV-6 | API | Optional |
| ST-1 – ST-6 | API (request chains) | To write; they become the Postman collection |
| IX-1 | API | To write |
| EP-1, EP-2, EP-6, BV-1, BV-2, BV-9, BV-10, IX-2 | – | Blocked by OQ-1, OQ-2, OQ-3 |

**Not in scope:** malformed timestamps (`400` input validation, not this rule); DST-crossing windows (the next Kyiv DST change, 2027-03-28, is more than 60 days away, so it can't be booked today).
