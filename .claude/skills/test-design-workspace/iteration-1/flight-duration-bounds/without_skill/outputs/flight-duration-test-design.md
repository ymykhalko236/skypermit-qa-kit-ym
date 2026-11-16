# Test design: flight duration rule (`TIME_WINDOW` gate)

**Spec:** `06-business-rules.md` (copy in this folder)
**Date:** 2026-11-16
**Techniques:** equivalence partitioning (EP), boundary value analysis (BVA), state transition testing (STT)

## 1. Rule under test

Quoted from the spec:

| Line | Text |
| --- | --- |
| 97 | `Duration` — "15–240 minutes, inclusive at both ends. `window_end` strictly after `window_start`." Source `TSD-4` §3 |
| 28 | Gate order: "`PILOT` → `AIRCRAFT` → `ZONE` → `TIME_WINDOW`" |
| 30 | "`failing_gate` in a `422` response always names the *first* gate to fail" |
| 190 | `TIME_WINDOW` / Duration out of range → `rule_reference` = `TSD-4 §3` |
| 101 | "`window_start`/`window_end` are stored and compared in UTC." |

Derived quantity: **duration = `window_end` − `window_start`** (in minutes).

Expected failure response (lines 30, 190): `422`, `failing_gate = TIME_WINDOW`, `rule_reference = TSD-4 §3`.

## 2. Isolation: fixed preconditions for every condition below

The duration check is in the last gate, so every other gate and every other `TIME_WINDOW` condition must pass. Use one baseline:

| Item | Value | Why (spec line) |
| --- | --- | --- |
| Zone | `DNI-OPN-1` (OPEN, ceiling 120 m, bands C0–C3, **no curfew**, `L1`, active) | No curfew, so long windows can't hit curfew (111, 159) |
| Operator | `authorisation_level` `L1` or higher | ZONE gate (85) |
| Pilot | any rating (OPEN), `certified_on` less than 18 months before `window_start` | PILOT gate (42–43) |
| Aircraft | e.g. 800 g (C0) | AIRCRAFT gate (51, 134) |
| Altitude | e.g. 100 m (≤ 120 m) | ZONE altitude (84) |
| `window_start` | e.g. submission time + 2 days | Lead time ≥ 6 h (95), advance ≤ 60 days (96) |
| Other requests | none `APPROVED`/`UNDER_REVIEW` for the same aircraft overlapping the window | No overlap (99) |

## 3. Equivalence partitions

Input: duration D = `window_end` − `window_start`, in minutes.

| ID | Partition | Valid? | Representative | Expected |
| --- | --- | --- | --- | --- |
| EP-1 | D < 0 (`window_end` before `window_start`) | Invalid | D = −60 | `422`, `TIME_WINDOW`, `TSD-4 §3` (see U-2) |
| EP-2 | D = 0 (`window_end` = `window_start`) | Invalid | D = 0 | `422`, `TIME_WINDOW`, `TSD-4 §3` (see U-2) |
| EP-3 | 0 < D < 15 | Invalid (too short) | D = 5 | `422`, `TIME_WINDOW`, `TSD-4 §3` |
| EP-4 | 15 ≤ D ≤ 240 | Valid | D = 120 | Duration check passes (all gates pass) |
| EP-5 | D > 240 | Invalid (too long) | D = 300 | `422`, `TIME_WINDOW`, `TSD-4 §3` |

EP-1 and EP-2 come from the "strictly after" clause; EP-3 to EP-5 from "15–240 minutes, inclusive at both ends". EP-1/EP-2 are kept apart from EP-3 because the spec states them as a separate sub-condition and an implementation may check them separately (or reject them earlier at input validation, see U-2).

## 4. Boundary values

Two-value BVA on each edge of the valid range, plus the "strictly after" edge. Minute granularity (see U-1).

| ID | D (min) | Example window (UTC) | Partition | Expected |
| --- | --- | --- | --- | --- |
| BV-1 | 0 | 10:00 → 10:00 | EP-2 | `422`, `TIME_WINDOW`, `TSD-4 §3` (see U-2) |
| BV-2 | 1 | 10:00 → 10:01 | EP-3 | `422`, `TIME_WINDOW`, `TSD-4 §3` |
| BV-3 | 14 | 10:00 → 10:14 | EP-3 | `422`, `TIME_WINDOW`, `TSD-4 §3` |
| BV-4 | **15** | 10:00 → 10:15 | EP-4 | passes (lower bound inclusive) |
| BV-5 | 16 | 10:00 → 10:16 | EP-4 | passes |
| BV-6 | 239 | 10:00 → 13:59 | EP-4 | passes |
| BV-7 | **240** | 10:00 → 14:00 | EP-4 | passes (upper bound inclusive) |
| BV-8 | 241 | 10:00 → 14:01 | EP-5 | `422`, `TIME_WINDOW`, `TSD-4 §3` |

Optional, only if sub-minute input is possible (U-1): 14 min 59 s and 240 min 1 s, expected to fail; their result must be confirmed first.

## 5. Gate-order and interaction checks

| ID | Condition | Expected | Basis |
| --- | --- | --- | --- |
| GO-1 | D = 14 **and** pilot certification lapsed | `422`, `failing_gate = PILOT`, `OH-1 §2.3` (not `TIME_WINDOW`) | Lines 28, 30 |
| GO-2 | D = 241 **and** altitude 130 m in `DNI-OPN-1` | `422`, `failing_gate = ZONE`, `ZC-2026.1 §2` | Lines 28, 30, 84 |
| GO-3 | D = 240 in a curfew zone where the window crosses curfew (e.g. `LVV-RST-2`, 20:30 → 00:30 zone-local) | Fails `TIME_WINDOW` on **curfew** (`ZC-2026.1 §3`), not duration | Lines 97, 98 — confirms a valid duration doesn't mask curfew |
| GO-4 | D = 241 **and** window crosses curfew | `422`, `TIME_WINDOW`; which `rule_reference` is returned is **unknown** | See U-3 |

## 6. State transitions

The spec file has no lifecycle definition: it names the states `DRAFT`, `UNDER_REVIEW`, `APPROVED`, `REJECTED`, `CANCELLED`, `COMPLETED` (line 99) and one transition rule, the cancellation deadline for `APPROVED` (line 170), but says nothing about which event runs the gates or what state a failing request moves to. So no state transition table can be derived for the duration rule from this spec alone.

What can be stated from the text:

| ID | Observation | Basis |
| --- | --- | --- |
| ST-1 | Duration doesn't change after `window_start`/`window_end` are set, so the rule's result is the same whenever it is checked (unlike pilot currency, which depends on the date). | Lines 97, 101 |
| ST-2 | The overlap rule treats `APPROVED` and `UNDER_REVIEW` windows as occupied. A request rejected for duration (once rejected) shouldn't block another request for the same aircraft. Testable only once the state reached on failure is known. | Line 99 |

Candidate transitions to design once the lifecycle (`02 - State Machine`) is available: `DRAFT` + submit with D in EP-4 → next state; `DRAFT` + submit with D in EP-1/2/3/5 → expected failure state; editing the window of a `DRAFT` from invalid to valid duration and resubmitting. Not designed here because the expected states would be guesses (U-4).

## 7. Unknowns (not guessed)

| ID | Question | Affects |
| --- | --- | --- |
| U-1 | Time granularity: are `window_start`/`window_end` minute-precision, or can seconds be sent? If seconds are allowed, is 14 min 59 s rejected and 240 min 30 s rejected (likely, but the spec only says "minutes")? | BVA §4 optional rows |
| U-2 | Is `window_end ≤ window_start` reported as `422` / `TIME_WINDOW` / `TSD-4 §3`, or rejected earlier as a `400` input error? The spec puts it in the Duration row but doesn't say how it's reported. | EP-1, EP-2, BV-1 |
| U-3 | Order of conditions **inside** `TIME_WINDOW`: the spec defines order between gates only. When duration and another time condition (curfew, lead time, overlap) both fail, which `rule_reference` is returned? | GO-4 |
| U-4 | Which action runs the gates (validate, submit, or both), and what state a request moves to when it fails or passes. | §6 |
| U-5 | Is a request with `window_end` missing (null) a duration failure or an input error? | Not covered above |

## 8. Coverage summary

- 5 equivalence partitions (1 valid, 4 invalid)
- 8 boundary values (0, 1, 14, 15, 16, 239, 240, 241)
- 4 gate-order/interaction checks
- 0 designed state transitions (lifecycle not in spec), 2 observations, 5 unknowns
