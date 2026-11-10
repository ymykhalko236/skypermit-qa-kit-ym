# API-OP-004: Validate that fails on lead time leaves the request in DRAFT

| Field | Value |
|---|---|
| ID | API-OP-004 |
| Summary | After `POST /flight-requests/{id}/validate` returns `422` on the `TIME_WINDOW` gate for a 5 h 59 min lead time, `GET /flight-requests/{id}` still shows `state` `DRAFT` |
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
| 1 | **POST** `/api/v1/flight-requests/{flightRequestId}/validate`<br>Auth: operator session of `op-api-shared@test.example`<br>Body: none | • Status `422`<br>• `failing_gate` is `TIME_WINDOW`<br>• `rule_reference` is `TSD-4 §2.1`<br>• `message` is a non-empty string |
| 2 | **GET** `/api/v1/flight-requests/{flightRequestId}`<br>Auth: operator session of `op-api-shared@test.example`<br>Body: none | • Status `200`<br>• `state` is `DRAFT` |

## Postconditions
- The flight request stays in `DRAFT`.
- The request stays under the shared operator, because the API can't delete it. Later runs read only their own request by `id`, so this needs no cleanup.
- The pilot and aircraft are new in every run (`{stamp}`), so the pilot is always current and the aircraft carries no earlier request.

## Priority
2 — if `validate` changed state, "check before submitting" would reject requests the operator never submitted.

## Source
[03 - API Contract](https://yaroslavmyhalko236.atlassian.net/wiki/spaces/SD1/pages/622593) endpoint 13 (`validate` "never changes state"), endpoint 11, "The `422` body". [02 - State Machine](https://yaroslavmyhalko236.atlassian.net/wiki/spaces/SD1/pages/196808) (`DRAFT`: created, never submitted, no gates have run; only submit leaves it toward `REJECTED`). [06 - Business Rules](https://yaroslavmyhalko236.atlassian.net/wiki/spaces/SD1/pages/688129) §1.4, "Minimum lead time", and §6 (`TSD-4 §2.1`). `public/openapi.yaml` (`FlightRequest.state`). Chat decision, 10/11/2026: the invalid boundary value is 5 h 59 min. Chat decision, 10/11/2026: every API case logs in as the shared operator `op-api-shared@test.example` (`api-automation/test-accounts.json`) and creates a fresh pilot and aircraft per run.
