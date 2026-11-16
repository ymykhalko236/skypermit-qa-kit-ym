# SkyPermit — Business Rules

**Status:** Compiled from currently in-force source documents. Not itself a governing document — each rule below carries a citation back to the document and section that actually governs it. Where this compilation and a source document disagree, the source document governs; treat that as a bug in this file, not in the source.

⚠️ **One exception to that rule:** the `AIRCRAFT`/`ZONE` gate assignment for
the weight-band check below has been corrected per `docs/07-clarifications.md`
— the rules owner confirmed `ZC-2026.1` §2's literal "fails the zone gate"
wording is itself a corpus error. See that file for the reasoning; this
document has been updated to match rather than reproduce the error.

**Companion to:** *SkyPermit — System Reference*, which defines persisted fields, states, endpoints, and response contracts but explicitly excludes decision logic. This document is the piece it points to and does not restate.

**Sources used (all currently in force):**

- `OH-1` v2.0 — Operations Handbook (pilot ratings/currency, aircraft weight bands, operator authorisation levels)
- `ZC-2026.1` — Zone Catalogue, as amended by `A-7`
- `TSD-4` — Time & Scheduling Directive
- `API-REF` — Endpoint Reference (§4.1, the `422` `rule_reference` contract; §5, gate evaluation order)

**Explicitly not a source:** `CR-1` (Airspace Policy Group, 2026-03-02), which proposes replacing the pilot qualification model, extending the weight scale, and revising the zone catalogue. CR-1 states plainly that it is "a proposal, not an adopted standard. Nothing in it is in force, and no existing published document is withdrawn or amended by it." None of the values below come from it. `OH-1` v1.4 is likewise excluded as a source — it is superseded and retained for audit only — but is noted twice below where its superseded values matter for anyone reading old records.

---

## Evaluation order

Gates run in a fixed order and evaluation stops at the first failure:

**`PILOT` → `AIRCRAFT` → `ZONE` → `TIME_WINDOW`**

`failing_gate` in a `422` response always names the *first* gate to fail, never every gate that would fail. \[`API-REF` §5\]

---

## 1. The four gates' pass/fail logic

### 1.1 `PILOT`

Two independent conditions. Both must hold.

| Condition | Rule | Source |
| --- | --- | --- |
| Rating covers the zone's class | Pilot's `rating` must permit the zone's `zone_class`: `R_BASIC` → `OPEN` only · `R_ADVANCED` → `OPEN`, `CONTROLLED` · `R_BVLOS` → `OPEN`, `CONTROLLED`, `RESTRICTED`. Evaluated independently of the zone gate — a request can fail one without the other. | `OH-1` §2.1 |
| Certification current | Current for **18 months** from `certified_on`. No grace period. Checked against the flight's `window_start`, **not** submission time — a rating current at submission but lapsed by the flight window fails this gate. | `OH-1` §2.3 |

Currency is never stored — it's computed at the moment it's checked.

### 1.2 `AIRCRAFT`

| Condition | Rule | Source |
| --- | --- | --- |
| Weight band permitted | The aircraft's derived weight band must be one of the zone's `permitted_bands`. | `ZC-2026.1` §2 — see note below |

⚠️ **Gate assignment corrected per `docs/07-clarifications.md`.** `ZC-2026.1`
§2's literal text says this "fails the zone gate," but the rules owner has
confirmed that wording is a corpus error — this check belongs to `AIRCRAFT`,
not `ZONE`. The rule itself (weight band vs. `permitted_bands`) and its
citation are unchanged; only the gate it fails under has moved. Implement it
in `lib/gates/aircraft-gate.ts`.

⚠️ **Same citation as the `ZONE` altitude check, deliberately.** `ZC-2026.1`
§2 covers both the weight-band rule (this section) and the altitude-vs-
ceiling rule (§1.3 below) — the source document doesn't subdivide §2 any
further, so both rules cite `"ZC-2026.1 §2"` verbatim with no `.a`/`.b`
suffix to distinguish them. This is not a copy-paste error in this
compilation. In a `422` response the two are always distinguishable anyway,
because `failing_gate` (`AIRCRAFT` vs. `ZONE`) disambiguates them — a reader
should key off `failing_gate` first and treat `rule_reference` as a citation,
not a unique identifier.

For completeness, the other aircraft-adjacent rule in the corpus:

| What it is | Rule | Source | Is it this gate? |
| --- | --- | --- | --- |
| Weight ceiling at registration | An aircraft with `mtom_grams` \> 30,000 g is refused registration outright (`422`), **before any gate runs against it**. This happens at the `/aircraft` write, not at flight-request time — it never reaches a `FlightRequest` for any gate to evaluate. | `OH-1` §3; `API-REF` §4 | No — this is a registration-time precondition, not a gate outcome |

`Aircraft.status` (`ACTIVE`/`RETIRED`) is not tied to this or any gate by
any source document — see `docs/07-clarifications.md` item 2. Leave it
unwired.

### 1.3 `ZONE`

| Condition | Rule | Source | Explicitness |
| --- | --- | --- | --- |
| Altitude within ceiling | `requested_altitude_metres` must be ≤ the zone's `ceiling_metres`. | `ZC-2026.1` §2 *(shared with the `AIRCRAFT` weight-band citation — see §1.2's note; `failing_gate` disambiguates)* | Explicit — text says "fails the zone gate" |
| Operator authorisation level | Operator's `authorisation_level` must be ≥ the zone's `required_authorisation_level` (`L1` \< `L2` \< `L3`). Independent of pilot rating and aircraft band. | `OH-1` §4 | Confirmed by the rules owner — see `docs/07-clarifications.md` item 4 |
| Zone active | An inactive zone fails any flight request against it. | `ZC-2026.1` §4 | Inferred — source says "fails validation," doesn't name a specific gate. Citation not yet confirmed — see `docs/07-clarifications.md` item 4 |

The weight-band-vs-zone rule that appeared here in earlier drafts has moved
to `AIRCRAFT` — see §1.2 above and `docs/07-clarifications.md` item 1.

### 1.4 `TIME_WINDOW`

| Condition | Rule | Source |
| --- | --- | --- |
| Minimum lead time | ≥ 6 hours between submission and `window_start`. | `TSD-4` §2.1 |
| Maximum advance booking | ≤ 60 days before `window_start`. | `TSD-4` §2.2 (restated `OH-1` §5) |
| Duration | 15–240 minutes, inclusive at both ends. `window_end` strictly after `window_start`. | `TSD-4` §3 |
| Curfew | No part of the window may fall inside the zone's curfew, if it has one. Evaluated minute-by-minute across the whole window, not just the endpoints. Curfews crossing midnight are one continuous period. | `TSD-4` §4 |
| No overlap | No other `APPROVED` or `UNDER_REVIEW` request for the **same aircraft** may share an instant with this window. Windows that only touch at a boundary (one ends 14:00, next starts 14:00) do not overlap. `DRAFT`, `REJECTED`, `CANCELLED`, `COMPLETED` requests are not considered. | `TSD-4` §5 |

**On UTC vs. zone-local time:** `window_start`/`window_end` are stored and compared in UTC. Curfews are defined in zone-local time. The conversion happens at evaluation time, not at write time — there is no stored "curfew in UTC" value to drift out of sync with the zone record.

**Curfew values, per zone, in force today** (general value from `ZC-2026.1`, overridden where `A-7` applies):

| Zone | Curfew | Source |
| --- | --- | --- |
| `KBP-CTR-3` | **23:00–05:00** | `A-7` §1 — narrows the `ZC-2026.1` general value of 22:00–06:00; `A-7` §4 states the amendment governs where the two disagree |
| `ODS-CTR-5` | **23:00–05:00** | `A-7` §1 — same override |
| `LVV-RST-2` | 22:00–06:00 | `ZC-2026.1` §3, unamended |
| `ZTM-RST-7` | 22:00–06:00 | `ZC-2026.1` §3, unamended |
| `DNI-OPN-1` | none | `ZC-2026.1` §3 |
| `KHR-OPN-4` | none | `ZC-2026.1` §3 |

Always check the amendment register before trusting the base catalogue's curfew column for `KBP-CTR-3` or `ODS-CTR-5` — this is the one place the two documents disagree and the amendment is the one that wins.

---

## 2. Pilot currency threshold

A pilot's certification is **current for 18 months from `certified_on`**. No grace period — one day past the 18-month mark is not current. Evaluated against the flight's `window_start`, not the request's submission time, so a rating current when a request is created can still lapse before the flight itself. Currency is derived, never stored.

Source: `OH-1` v2.0 §2.3 — **the currently governing value.**

⚠️ `OH-1` v1.4 (superseded, audit-only) used **24 months**. If any historical record or old ticket cites 24 months, it's from the superseded edition — do not carry it into current implementation.

---

## 3. Aircraft weight band thresholds

Four bands, upper-bound inclusive. This is the complete taxonomy currently in force — there is no `C4` or `C5` in any governing document. (Those only appear in the unadopted `CR-1` proposal, which is out of scope — see the top of this document.)

| Band | Lower bound | Upper bound |
| --- | --- | --- |
| `C0` | 0 g | 900 g (inclusive) |
| `C1` | above 900 g | 3,500 g (inclusive) |
| `C2` | above 3,500 g | 12,000 g (inclusive) |
| `C3` | above 12,000 g | 30,000 g (inclusive) |

An aircraft weighing exactly 900 g is `C0`; exactly 3,500 g is `C1`; exactly 12,000 g is `C2`. `Zone.permitted_bands` references this same four-band taxonomy (`C0`–`C3`) — nothing outside it is valid.

**Above 30,000 g:** not accepted for registration under any circumstance. This is enforced at the `/aircraft` write with a `422`, before the aircraft record — and therefore before any gate — exists. There is currently no path for such an aircraft to reach a flight request at all.

Source: `OH-1` v2.0 §3 — **the currently governing table.**

⚠️ `OH-1` v1.4 (superseded) set the `C1`/`C2` boundary at 4,000 g rather than 3,500 g. If reconciling old data or old test fixtures, that boundary shift is the thing to check for first.

---

## 4. Zone catalogue

Six zones, all currently active. Base values from `ZC-2026.1` §3, with `A-7`'s curfew narrowing applied for the two zones it covers (see §1.4 above for the full curfew reasoning).

| Code | Name | Class | Ceiling | Permitted bands | Curfew | Required auth. level | Active |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `KBP-CTR-3` | Kyiv Boryspil Corridor 3 | `CONTROLLED` | 120 m | C0–C2 | 23:00–05:00 *(per `A-7`)* | `L2` | yes |
| `ODS-CTR-5` | Odesa Corridor 5 | `CONTROLLED` | 90 m | C0–C2 | 23:00–05:00 *(per `A-7`)* | `L2` | yes |
| `LVV-RST-2` | Lviv Restricted 2 | `RESTRICTED` | 60 m | C0–C1 | 22:00–06:00 | `L3` | yes |
| `ZTM-RST-7` | Zhytomyr Restricted 7 | `RESTRICTED` | 45 m | C0 | 22:00–06:00 | `L3` | yes |
| `DNI-OPN-1` | Dnipro Open 1 | `OPEN` | 120 m | C0–C3 | none | `L1` | yes |
| `KHR-OPN-4` | Kharkiv Open 4 | `OPEN` | 120 m | C0–C3 | none | `L1` | yes |

`zone_class` also gates pilot rating independently of this table: `OPEN` accepts any rating, `CONTROLLED` requires `R_ADVANCED` or `R_BVLOS`, `RESTRICTED` requires `R_BVLOS`. (`ZC-2026.1` §2, `OH-1` §2.1 — restated here because both documents state it and a seed file would otherwise need to derive it from `zone_class` alone.)

Source: `ZC-2026.1` §3–§4; `A-7` §1, §4.

---

## 5. Cancellation deadline

An `APPROVED` request may be cancelled up to **2 hours before `window_start`**. A cancellation attempted closer than that is rejected; the request must proceed or be handled by reviewer action instead.

Source: `TSD-4` §6.

---

## 6. `rule_reference` values

Ready to hardcode into gate responses. Format matches the existing `API-REF` §4.1 example (`"TSD-4 §3.2"`) — note that example itself is illustrative, not a real citation; the real ones are below.

| Gate | Condition | `rule_reference` |
| --- | --- | --- |
| `PILOT` | Rating doesn't cover zone class | `OH-1 §2.1` |
| `PILOT` | Certification not current | `OH-1 §2.3` |
| `AIRCRAFT` | Weight band not permitted | `ZC-2026.1 §2` *(shared citation, see §1.2 note above)* |
| `ZONE` | Altitude exceeds ceiling | `ZC-2026.1 §2` *(shared citation, see §1.2 note above)* |
| `ZONE` | Operator authorisation level too low | `OH-1 §4` |
| `ZONE` | Zone inactive | `ZC-2026.1 §4` *(citation not yet fully confirmed — see `docs/07-clarifications.md`)* |
| `TIME_WINDOW` | Lead time too short | `TSD-4 §2.1` |
| `TIME_WINDOW` | Booked too far in advance | `TSD-4 §2.2` |
| `TIME_WINDOW` | Duration out of range | `TSD-4 §3` |
| `TIME_WINDOW` | Falls within curfew — `KBP-CTR-3`/`ODS-CTR-5` | `A-7 §1` |
| `TIME_WINDOW` | Falls within curfew — other zones | `ZC-2026.1 §3` |
| `TIME_WINDOW` | Overlaps another request | `TSD-4 §5` |
| *(n/a — registration, not a gate)* | Aircraft `mtom_grams` \> 30,000 g | `OH-1 §3` |

---

## 7. Open questions — do not guess these

**Canonical status lives in `docs/05-open-questions.md` — read that, not
this section, for what's currently open vs. resolved.** In short: only the
`Operator.status = SUSPENDED` response shape and the zone-`active` citation
remain open, and neither blocks gate implementation. `docs/07-clarifications.md`
has the reasoning behind each resolution.

---

*This document reflects the corpus as of the dates on its source documents (`TSD-4` and `ZC-2026.1` effective 2026-01-01, `A-7` effective 2026-02-10, `OH-1` v2.0 effective 2026-01-15). It does not reflect `CR-1`, which remains an unadopted proposal.*
