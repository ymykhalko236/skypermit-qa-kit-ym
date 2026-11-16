# Test design: flight duration rule (`TIME_WINDOW`, `TSD-4 §3`)

**Spec:** `06-business-rules.md` (copy in this folder)
**Rule under test:** §1.4 `TIME_WINDOW`, line 97:

> | Duration | 15–240 minutes, inclusive at both ends. `window_end` strictly after `window_start`. | `TSD-4` §3 |

**Expected failure output** (§6, line 190): `failing_gate = TIME_WINDOW`, `rule_reference = "TSD-4 §3"` ("Duration out of range").

**Techniques:** equivalence partitioning (EP), boundary value analysis (BVA, 3-value), state transition (ST: see section 4; the spec gives no lifecycle for this rule).

---

## 1. Test variable and derived input

- Inputs: `window_start`, `window_end` (UTC, line 101).
- Derived variable: `duration = window_end − window_start`, in minutes.
- Two constraints stated by the rule:
  - C1: `15 ≤ duration ≤ 240` (minutes, both ends inclusive).
  - C2: `window_end > window_start` (strictly).
- C2 is logically implied by C1 (any duration ≥ 15 is > 0), but the spec states it separately, so it gets its own partitions.

## 2. Isolation conditions (to keep other gates and conditions passing)

Gates run `PILOT → AIRCRAFT → ZONE → TIME_WINDOW` and stop at the first failure (line 28–30). `TIME_WINDOW` is last, so every check below needs a request that passes all earlier gates and the other `TIME_WINDOW` conditions:

| Concern | Setting that keeps it passing | Spec reference |
| --- | --- | --- |
| PILOT rating | Zone `DNI-OPN-1` (`OPEN`) accepts any rating | lines 42, 159, 162 |
| PILOT currency | `certified_on` well under 18 months before `window_start` | line 43, §2 |
| AIRCRAFT band | `DNI-OPN-1` permits `C0`–`C3`; any registered aircraft passes | line 159 |
| ZONE altitude | `requested_altitude_metres` ≤ 120 | line 84, 159 |
| ZONE auth level | Operator `L1` or above (`DNI-OPN-1` requires `L1`) | line 85, 159 |
| ZONE active | `DNI-OPN-1` is active | line 159 |
| Lead time | `window_start` ≥ 6 h after submission (use e.g. +2 days) | line 95 |
| Advance booking | `window_start` ≤ 60 days ahead | line 96 |
| Curfew | `DNI-OPN-1` has no curfew, so even a 240-min window cannot hit one | line 111, 159 |
| Overlap | No other `APPROVED`/`UNDER_REVIEW` request for the same aircraft in the window (fresh aircraft) | line 99 |

Recommended baseline: zone `DNI-OPN-1`, `window_start = <submission + 2 days>, 10:00 UTC`, vary only `window_end`.

---

## 3. Equivalence partitions

| ID | Partition | Range (minutes) | Valid? | Expected result | Representative |
| --- | --- | --- | --- | --- | --- |
| EP-1 | `window_end` before `window_start` | duration < 0 | Invalid (C2, C1) | Fail `TIME_WINDOW`, `TSD-4 §3` | −60 (start 10:00, end 09:00) |
| EP-2 | `window_end` equal to `window_start` | duration = 0 | Invalid (C2, C1) | Fail `TIME_WINDOW`, `TSD-4 §3` | 0 (10:00 → 10:00) |
| EP-3 | Positive but too short | 0 < duration < 15 | Invalid (C1) | Fail `TIME_WINDOW`, `TSD-4 §3` | 7 (10:00 → 10:07) |
| EP-4 | Within range | 15 ≤ duration ≤ 240 | Valid | `TIME_WINDOW` passes (request passes all gates with the baseline) | 120 (10:00 → 12:00) |
| EP-5 | Too long | duration > 240 | Invalid (C1) | Fail `TIME_WINDOW`, `TSD-4 §3` | 360 (10:00 → 16:00) |

Note: EP-1 and EP-2 are listed separately because the spec names C2 as its own condition; both are expected to cite `TSD-4 §3` (the only duration citation in §6). Whether the system returns a different message for C2 is not specified (see U-3).

---

## 4. Boundary values (3-value BVA, 1-minute step)

Step = 1 minute (see U-1 for sub-minute precision).

| ID | Boundary | Duration (min) | Example (`window_start` 10:00 UTC) | Expected result |
| --- | --- | --- | --- | --- |
| BV-1 | C2 lower edge, below | −1 | end 09:59 | Fail `TIME_WINDOW`, `TSD-4 §3` |
| BV-2 | C2 edge, on | 0 | end 10:00 | Fail `TIME_WINDOW`, `TSD-4 §3` |
| BV-3 | C2 edge, above | 1 | end 10:01 | Fail `TIME_WINDOW`, `TSD-4 §3` (passes C2, fails C1) |
| BV-4 | Min, below | 14 | end 10:14 | Fail `TIME_WINDOW`, `TSD-4 §3` |
| BV-5 | Min, on | 15 | end 10:15 | Pass |
| BV-6 | Min, above | 16 | end 10:16 | Pass |
| BV-7 | Max, below | 239 | end 13:59 | Pass |
| BV-8 | Max, on | 240 | end 14:00 | Pass |
| BV-9 | Max, above | 241 | end 14:01 | Fail `TIME_WINDOW`, `TSD-4 §3` |

Minimum set if trimming: BV-2, BV-4, BV-5, BV-8, BV-9 (2-value BVA plus the equality edge of C2).

Optional extra boundary checks (same rule, different representation):
- BV-10: window crossing midnight UTC with a valid duration, e.g. 23:00 → 01:00 (120 min): Pass. Checks the duration is computed on full timestamps, not on time-of-day. Safe in `DNI-OPN-1` (no curfew).
- BV-11: window crossing midnight UTC with 241 min, e.g. 22:00 → 02:01: Fail `TSD-4 §3`.

---

## 5. State transitions

The rule itself defines no states. The spec's state-related content is limited to:

- line 99: only `APPROVED`/`UNDER_REVIEW` requests count for overlap; `DRAFT`, `REJECTED`, `CANCELLED`, `COMPLETED` exist as statuses.
- §5 (line 170): `APPROVED` → cancelled up to 2 h before `window_start`.

The spec does **not** say which transition a duration failure (or pass) triggers on validate or submit (for example `DRAFT` → `REJECTED` on a failed submit, or `DRAFT` → `UNDER_REVIEW` on a pass). So no state transition table can be derived from this file for the duration rule. Candidate transitions to confirm against the state machine spec (not provided):

| ID | From | Event | Guard | To (unconfirmed) |
| --- | --- | --- | --- | --- |
| ST-1 | `DRAFT` | submit | duration in EP-4 (all gates pass) | `UNDER_REVIEW`? |
| ST-2 | `DRAFT` | submit | duration in EP-1/2/3/5 | `REJECTED`? with `failing_gate = TIME_WINDOW` |
| ST-3 | `DRAFT` | validate only | duration invalid | stays `DRAFT`? (validate without state change) |

Treat these as open (U-5), not as expected results.

---

## 6. Interaction checks (first-failure ordering)

Derived from line 28–30; these confirm duration failures are reported only when earlier gates pass.

| ID | Setup | Expected |
| --- | --- | --- |
| INT-1 | Duration 241 min **and** altitude 150 m in `DNI-OPN-1` | `failing_gate = ZONE` (`ZC-2026.1 §2`), not `TIME_WINDOW` |
| INT-2 | Duration 14 min **and** pilot `R_BASIC` in `KBP-CTR-3` | `failing_gate = PILOT` (`OH-1 §2.1`) |
| INT-3 | Duration 241 min **and** lead time 2 h | `failing_gate = TIME_WINDOW`; `rule_reference` is either `TSD-4 §2.1` or `TSD-4 §3` (order of conditions inside the gate not specified; see U-4) |

---

## 7. Unknowns / questions for the rules owner (not guessed)

| ID | Question | Why it matters |
| --- | --- | --- |
| U-1 | Precision of `window_start`/`window_end`: minutes, seconds or milliseconds? Is 14 min 59 s a fail and 240 min 0.001 s a fail? | Sets the BVA step; spec only says "minutes". |
| U-2 | Can the API accept `window_end` before `window_start` at all, or is that refused earlier (e.g. `400` at the write) before any gate runs? | EP-1/EP-2/BV-1/BV-2 may never reach `TIME_WINDOW`. |
| U-3 | Is the C2 violation (`end ≤ start`) reported with the same `rule_reference` `TSD-4 §3` and same message as "duration out of range"? | §6 has only one duration row. |
| U-4 | Order of conditions within `TIME_WINDOW` (lead time, advance booking, duration, curfew, overlap) when more than one fails. | Needed for INT-3 and any multi-violation test. |
| U-5 | Lifecycle effect of a duration pass/fail on validate vs. submit (see section 5). | No state transitions can be confirmed from this spec. |
| U-6 | Is duration re-evaluated if a request is edited, or when it moves between states after `DRAFT`? | Affects whether re-validation tests are needed. |

---

## 8. Coverage summary

| Technique | Items | IDs |
| --- | --- | --- |
| EP | 5 partitions (1 valid, 4 invalid) | EP-1 … EP-5 |
| BVA | 9 core + 2 optional (midnight crossing) | BV-1 … BV-11 |
| State transition | 0 confirmed, 3 candidates pending U-5 | ST-1 … ST-3 |
| Interaction | 3 | INT-1 … INT-3 |
| Open questions | 6 | U-1 … U-6 |
