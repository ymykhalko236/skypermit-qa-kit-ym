# API-OP-005: A second submit after a lead-time rejection returns 409

| Field | Value |
|---|---|
| ID | API-OP-005 |
| Summary | After `POST /flight-requests/{id}/submit` rejects a 5 h 59 min lead-time request with `422`, a second `submit` on the same request returns `409` |
| Business Rule | BR-TIME-LEAD-TIME |
| Date Created | 10/11/2026 |
| Date Last Updated | 10/11/2026 |
| Assigned To | |

## Preconditions
1. The SkyPermit API is available at `{baseUrl}` (`https://skypermit.vercel.app/api/v1`).
2. The shared operator `op-api-shared@test.example` (`L1`, `ACTIVE`, recorded in `api-automation/test-accounts.json`) is logged in with `POST /auth/login` (`password` from the secret `operatorPassword`, read from the OS variable `SKYPERMIT_OPERATOR_PASSWORD`), so the caller holds its session. It is never registered again.
3. Pilot created in this run with `POST /pilots` under the shared operator (one pilot for every case in the run): `full_name` `Test Pilot API`, `national_id` `TEST-PIL-API-{stamp}`, `rating` `R_BASIC`, `certified_on` 30 days before today. Its `id` is `{pilotId}`.
4. Aircraft created in this run with `POST /aircraft` under the shared operator (one aircraft for every case in the run): `manufacturer` `TestMaker`, `model` `TM-1`, `serial_number` `SN-TEST-{stamp}`, `mtom_grams` `800` (band `C0`). Its `id` is `{aircraftId}`.
5. Flight request created with `POST /flight-requests`: `pilot_id` `{pilotId}`, `aircraft_id` `{aircraftId}`, `zone_code` `DNI-OPN-1`, `window_start` now + 5 h 59 min, `window_end` `window_start` + 60 min, `requested_altitude_metres` `100`. It is in `DRAFT`, and its `id` is `{flightRequestId}`.
6. Every other gate passes for this request: `DNI-OPN-1` is `OPEN`, `L1`, ceiling 120 m, bands C0–C3, no curfew; the pilot is current and rated for `OPEN`; the duration is 60 min; the run's aircraft has no `UNDER_REVIEW` or `APPROVED` request, so there is no overlap.

## Steps and Expected Results
| # | Request | Expected Result |
|---|---|---|
| 1 | **POST** `/api/v1/flight-requests/{flightRequestId}/submit`<br>Auth: operator session of `op-api-shared@test.example`<br>Body: none | • Status `422`<br>• `failing_gate` is `TIME_WINDOW`<br>• `rule_reference` is `TSD-4 §2.1`<br>• `message` is a non-empty string |
| 2 | **POST** `/api/v1/flight-requests/{flightRequestId}/submit`<br>Auth: operator session of `op-api-shared@test.example`<br>Body: none | • Status `409` |

## Postconditions
- The flight request stays in `REJECTED`, which is terminal.
- The request stays under the shared operator, because the API can't delete it. Later runs read only their own request by `id`, so this needs no cleanup.
- The pilot and aircraft are new in every run (`{stamp}`), so the pilot is always current and the aircraft carries no earlier request.

## Priority
2 — if a rejected request could be submitted again, the terminal `REJECTED` state wouldn't hold.

## Source
[02 - State Machine](https://yaroslavmyhalko236.atlassian.net/wiki/spaces/SD1/pages/196808) (`REJECTED` is terminal; "`REJECTED`→anything … is illegal and returns `409`"). [03 - API Contract](https://yaroslavmyhalko236.atlassian.net/wiki/spaces/SD1/pages/622593) endpoint 10, "Error semantics" (`409`: invalid state transition), "The `422` body". [06 - Business Rules](https://yaroslavmyhalko236.atlassian.net/wiki/spaces/SD1/pages/688129) §1.4, "Minimum lead time", and §6 (`TSD-4 §2.1`). Chat decision, 10/11/2026: the invalid boundary value is 5 h 59 min. Chat decision, 10/11/2026: every API case logs in as the shared operator `op-api-shared@test.example` (`api-automation/test-accounts.json`) and creates a fresh pilot and aircraft per run.
