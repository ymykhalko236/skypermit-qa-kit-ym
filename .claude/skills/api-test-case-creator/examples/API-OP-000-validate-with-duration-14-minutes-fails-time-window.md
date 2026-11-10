# API-OP-000: Validate on a request with a 14-minute window fails the TIME_WINDOW gate on duration

| Field | Value |
|---|---|
| ID | API-OP-000 |
| Summary | `POST /flight-requests/{id}/validate` on a DRAFT request whose window lasts 14 minutes returns `422` naming the `TIME_WINDOW` gate and `TSD-4 §3` |
| Business Rule | BR-TIME-DURATION |
| Date Created | 10/11/2026 |
| Date Last Updated | 10/11/2026 |
| Assigned To | |

## Preconditions
1. The SkyPermit API is available at `https://skypermit.vercel.app`. Every request path in this case is the full path from that host, starting with `/api/v1`.
2. The shared operator `op-api-shared@test.example` (`L1`, `ACTIVE`, recorded in `api-automation/test-accounts.json`) is logged in with `POST /auth/login` (`password` from the secret `operatorPassword`, read from the OS variable `SKYPERMIT_OPERATOR_PASSWORD`), so the caller holds its session. It is never registered again.
3. Pilot created in this run with `POST /pilots` under the shared operator (one pilot for every case in the run): `full_name` `Test Pilot API`, `national_id` `TEST-PIL-API-{stamp}`, `rating` `R_BASIC`, `certified_on` 30 days before today. Its `id` is `{pilotId}`.
4. Aircraft created in this run with `POST /aircraft` under the shared operator (one aircraft for every case in the run): `manufacturer` `TestMaker`, `model` `TM-1`, `serial_number` `SN-TEST-{stamp}`, `mtom_grams` `800` (band `C0`). Its `id` is `{aircraftId}`.
5. Flight request created with `POST /flight-requests`: `pilot_id` `{pilotId}`, `aircraft_id` `{aircraftId}`, `zone_code` `DNI-OPN-1`, `window_start` now + 24 h, `window_end` `window_start` + 14 min, `requested_altitude_metres` `100`. It is in `DRAFT`, and its `id` is `{flightRequestId}`.
6. Every other gate passes for this request: `DNI-OPN-1` is `OPEN`, `L1`, ceiling 120 m, bands C0–C3, no curfew; the pilot is current and rated for `OPEN`; 24 h is inside the lead-time and advance-booking limits.

## Steps and Expected Results
| # | Request | Expected Result |
|---|---|---|
| 1 | **POST** `/api/v1/flight-requests/{flightRequestId}/validate`<br>Auth: operator session of `op-api-shared@test.example`<br>Body: none | • Status `422`<br>• `failing_gate` is `TIME_WINDOW`<br>• `rule_reference` is `TSD-4 §3`<br>• `message` is a non-empty string |

## Postconditions
- The flight request stays in `DRAFT`: `validate` never changes state.
- The request stays under the shared operator, because the API can't delete it. Later runs read only their own request by `id`, so this needs no cleanup.
- The pilot and aircraft are new in every run (`{stamp}`), so the pilot is always current and the aircraft carries no earlier request.

## Priority
1 — if a 14-minute window passed, the system would authorise a flight the time rules forbid.

## Source
[06 - Business Rules](https://yaroslavmyhalko236.atlassian.net/wiki/spaces/SD1/pages/688129) §1.4 (duration 15–240 minutes, inclusive) and §6 (`rule_reference` `TSD-4 §3`), §4 (`DNI-OPN-1` values). [03 - API Contract](https://yaroslavmyhalko236.atlassian.net/wiki/spaces/SD1/pages/622593) endpoint 13 (`validate` runs all gates and never changes state), "The `422` body" and "Gate pipeline". `public/openapi.yaml` (request bodies for `/operators`, `/pilots`, `/aircraft`, `/flight-requests`). The text of `message` isn't specified in Confluence, so only its presence is checked. Chat decision, 10/11/2026: every API case logs in as the shared operator `op-api-shared@test.example` (`api-automation/test-accounts.json`) and creates a fresh pilot and aircraft per run.
