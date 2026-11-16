# Test design: flight duration rule (`TIME_WINDOW` gate)

**Spec:** `06-business-rules.md` (copy in this folder)
**Rule under test:** §1.4 `TIME_WINDOW`, row "Duration" (line 97)
**Techniques:** equivalence partitioning (EP), boundary value analysis (BVA), state transition testing (STT)

## 1. Source text

| Line | Quote |
| --- | --- |
| 97 | "Duration \| 15–240 minutes, inclusive at both ends. `window_end` strictly after `window_start`. \| `TSD-4` §3" |
| 101 | "`window_start`/`window_end` are stored and compared in UTC." |
| 26-28 | "Gates run in a fixed order and evaluation stops at the first failure: **`PILOT` → `AIRCRAFT` → `ZONE` → `TIME_WINDOW`**" |
| 30 | "`failing_gate` in a `422` response always names the *first* gate to fail, never every gate that would fail." |
| 190 | "`TIME_WINDOW` \| Duration out of range \| `TSD-4 §3`" |

Derived quantity: `duration = window_end - window_start` (in minutes, both in UTC).

Expected outcome when the rule fails (lines 30, 190): `422`, `failing_gate = TIME_WINDOW`, `rule_reference = "TSD-4 §3"`.

## 2. Preconditions shared by every condition

To isolate the duration rule, each test request must pass every other gate and every other `TIME_WINDOW` condition:

- `PILOT`: pilot rating covers the zone's class and certification is current at `window_start` (lines 42-43).
- `AIRCRAFT`: aircraft band is in the zone's `permitted_bands` (line 51).
- `ZONE`: altitude <= ceiling, operator level >= required level, zone active (lines 84-86).
- `TIME_WINDOW` (other conditions): `window_start` is >= 6 h after submission (line 95) and <= 60 days ahead (line 96); window is fully outside any curfew (line 98); no overlapping `APPROVED`/`UNDER_REVIEW` request for the same aircraft (line 99).

Suggested fixture: zone `DNI-OPN-1` or `KHR-OPN-4` (line 159-160: `OPEN`, 120 m, C0-C3, no curfew, `L1`), so curfew cannot interfere even with a 240-minute window.

## 3. Equivalence partitions

| ID | Partition | Range (minutes) | Valid? | Representative | Expected | Source |
| --- | --- | --- | --- | --- | --- | --- |
| EP-1 | `window_end` before `window_start` (negative duration) | d < 0 | Invalid | -60 | Fails `TIME_WINDOW`, `TSD-4 §3` | line 97 "strictly after" |
| EP-2 | `window_end` equal to `window_start` (zero duration) | d = 0 | Invalid | 0 | Fails `TIME_WINDOW`, `TSD-4 §3` | line 97 "strictly after" |
| EP-3 | Positive but below minimum | 0 < d < 15 | Invalid | 5 | Fails `TIME_WINDOW`, `TSD-4 §3` | line 97 "15–240 minutes" |
| EP-4 | Within range | 15 <= d <= 240 | Valid | 120 | Duration condition passes (request passes gate if all else holds) | line 97 "inclusive at both ends" |
| EP-5 | Above maximum | d > 240 | Invalid | 480 | Fails `TIME_WINDOW`, `TSD-4 §3` | line 97 "15–240 minutes" |

Note: EP-1 and EP-2 are kept apart from EP-3 because the spec states the "strictly after" constraint as a separate sentence; the spec gives the same `rule_reference` for all of them (line 190), so the expected response is the same.

## 4. Boundary values

Two-value BVA at each boundary, with 1 minute as the step (the spec states the range in minutes; see U-1 for finer granularity).

| ID | Boundary | Duration | `window_start` → `window_end` example (UTC) | Expected | Source |
| --- | --- | --- | --- | --- | --- |
| BV-1 | start = end | 0 min | 10:00 → 10:00 | Fail, `TIME_WINDOW`, `TSD-4 §3` | line 97 |
| BV-2 | just after start | 1 min | 10:00 → 10:01 | Fail, `TIME_WINDOW`, `TSD-4 §3` (below 15) | line 97 |
| BV-3 | below lower bound | 14 min | 10:00 → 10:14 | Fail, `TIME_WINDOW`, `TSD-4 §3` | line 97 |
| BV-4 | lower bound | 15 min | 10:00 → 10:15 | Pass | line 97 "inclusive at both ends" |
| BV-5 | upper bound | 240 min | 10:00 → 14:00 | Pass | line 97 "inclusive at both ends" |
| BV-6 | above upper bound | 241 min | 10:00 → 14:01 | Fail, `TIME_WINDOW`, `TSD-4 §3` | line 97 |
| BV-7 | end before start (by 1 min) | -1 min | 10:00 → 09:59 | Fail, `TIME_WINDOW`, `TSD-4 §3` | line 97 "strictly after" |

Optional three-value additions: 16 min (pass) and 239 min (pass).

### Combined/derived checks

| ID | Check | Expected | Source |
| --- | --- | --- | --- |
| CC-1 | Window of 120 min crossing UTC midnight (23:00 → 01:00 next day) on a no-curfew zone | Pass (duration computed across the date change) | line 97, line 101 (UTC comparison) |
| CC-2 | Duration 241 min AND an earlier gate fails (e.g. pilot rating does not cover zone class) | `failing_gate = PILOT`, not `TIME_WINDOW` | lines 26-30 |
| CC-3 | Duration 241 min, all earlier gates pass | `failing_gate = TIME_WINDOW`, `rule_reference = TSD-4 §3` | lines 30, 190 |

## 5. State transitions

The spec does not define a lifecycle for the duration rule, and the duration rule itself has no states: it is a stateless check on two timestamps. The only state names in the file appear in the overlap rule (line 99: "`DRAFT`, `REJECTED`, `CANCELLED`, `COMPLETED`", "`APPROVED` or `UNDER_REVIEW`"), and the file does not say which transitions run the gates or which state a request enters when the duration check fails.

So no state transition table can be derived from this spec. The transitions to test (for example: a request whose duration fails at submission, and what state it ends in; whether editing the window of a `DRAFT` re-triggers the check) need the state machine document, which is outside this input. See U-4.

## 6. Unknowns (not guessed)

| ID | Question | Why it matters |
| --- | --- | --- |
| U-1 | Granularity: are timestamps compared to the minute, second or millisecond? Is 14 min 59 s, or 240 min 30 s, in or out of range? | Determines the step for BVA. The spec gives the range in minutes only. |
| U-2 | Does `window_end <= window_start` fail as the duration condition (`TSD-4 §3`) or is it rejected earlier as a malformed request (e.g. `400`)? | Line 97 puts it in the gate's row, but the file does not state the HTTP response for invalid input before gates run. |
| U-3 | When more than one `TIME_WINDOW` condition fails (e.g. duration 300 min and lead time 2 h), which `rule_reference` is returned? | Line 30 orders gates, not conditions within a gate. |
| U-4 | Which state transitions trigger gate evaluation, and which state results from a duration failure? | Needed for any state transition tests; not in this file. |
| U-5 | Behaviour when `window_end` is missing or null. | Not covered by the rule text. |
| U-6 | Interaction with the upper booking limit: is the 60-day limit (line 96) measured on `window_start` only, so a 240-min window may end past day 60? | Affects fixtures near the advance-booking limit; keep duration tests well inside it. |

## 7. Coverage summary

- EP: 5 partitions (1 valid, 4 invalid).
- BVA: 7 values (2 valid, 5 invalid), plus 2 optional three-value points.
- Combined: 3 checks (midnight crossing, gate order, `rule_reference`).
- STT: none derivable from this spec (U-4).
- Unknowns: 6.
