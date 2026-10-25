# TC-CHK-007: A 15-minute flight window passes the time window check

| Field | Value |
|---|---|
| ID | TC-CHK-007 |
| Summary | Submitting a flight request with a window of exactly 15 minutes (the inclusive minimum) passes all gates, including `TIME_WINDOW`, and the request moves to `UNDER_REVIEW` |
| Business Rule | BR-TIME-DURATION |
| Date Created | 25/10/2026 |
| Date Last Updated | 25/10/2026 |
| Assigned To | |

## Preconditions
1. The SkyPermit API is available at `{BASE_URL}`.
2. Operator `op-chk-007@test.example` exists with `authorisation_level` = `L1` and `status` = `ACTIVE`, and the API client holds its session cookie.
3. Pilot `Test Pilot CHK-007` (national ID `TEST-PIL-CHK-007`) is registered under that operator with `rating` = `R_BASIC` and `certified_on` = the date 6 months before the test date (for example `2026-04-25` when testing on 25/10/2026), so the certification is current. Its `id` is `{PILOT_ID}`.
4. Aircraft `TestMaker TM-1` (serial `SN-TEST-CHK-007`) is registered under that operator with `mtom_grams` = `800` (band `C0`). Its `id` is `{AIRCRAFT_ID}`. No other flight request for this aircraft is in `APPROVED` or `UNDER_REVIEW`.
5. Zone `DNI-OPN-1` exists as in the catalogue: class `OPEN`, ceiling 120 m, permitted bands `C0`–`C3`, no curfew, required level `L1`, active.
6. The tester notes `S` = the current UTC time plus 24 hours, rounded down to the whole minute (for example `2026-10-26T10:00:00Z`), immediately before step 1.

## Steps and Expected Results
| # | Step | Expected Result |
|---|---|---|
| 1 | Send `POST {BASE_URL}/api/v1/flight-requests` with the session cookie, header `Content-Type: application/json` and body:<br>`{"pilot_id": "{PILOT_ID}", "aircraft_id": "{AIRCRAFT_ID}", "zone_code": "DNI-OPN-1", "window_start": "<S>", "window_end": "<S + 15 min>", "requested_altitude_metres": 50, "flight_purpose": "TC-CHK-007 duration"}`<br>For example, with `S` = `2026-10-26T10:00:00Z`, `window_end` = `2026-10-26T10:15:00Z`, exactly 15 minutes later. Note the returned `id` as `{FR_ID}`. | • The response status is `201`.<br>• The response body has `state` = `DRAFT`. |
| 2 | Send `POST {BASE_URL}/api/v1/flight-requests/{FR_ID}/submit` with the session cookie. | • The response status is `200`.<br>• The response body has `state` = `UNDER_REVIEW`. |
| 3 | Send `GET {BASE_URL}/api/v1/flight-requests/{FR_ID}` with the session cookie. | • The response status is `200`.<br>• `state` = `UNDER_REVIEW`.<br>• `failing_gate` and `rule_reference` are empty (`null`). |

## Postconditions
- Flight request `{FR_ID}` is in `UNDER_REVIEW` and now counts in the overlap check for aircraft `{AIRCRAFT_ID}`.
- Cleanup: send `POST {BASE_URL}/api/v1/flight-requests/{FR_ID}/cancel` with the session cookie. To run again, use a new `S`.

## Priority
2 — if this failed, valid minimum-length flights would be refused, blocking a main function.

## Source
`06-business-rules.md` §1.4, "Duration" (15–240 minutes, inclusive at both ends); §1.1–§1.4 and §4 for the data that passes every other gate and check (lead time ≥ 6 h per `TSD-4 §2.1`, met by `S` = now + 24 h; no curfew; no overlap). `02-state-machine.md`, `DRAFT` submit → `UNDER_REVIEW` when gates pass, and `UNDER_REVIEW` cancel → `CANCELLED`. `01-data-model.md`, FlightRequest (`failing_gate` and `rule_reference` populated only on gate-failure rejection). `public/openapi.yaml`, `POST /flight-requests/{id}/submit` (`200`, moved to `UNDER_REVIEW`).
