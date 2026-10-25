# TC-CHK-004: Submission just under 60 days before the window passes the time window check

| Field | Value |
|---|---|
| ID | TC-CHK-004 |
| Summary | Submitting a flight request whose `window_start` is 59 days and 23 hours after submission passes all gates, including `TIME_WINDOW`, and the request moves to `UNDER_REVIEW` |
| Business Rule | BR-TIME-MAX-ADVANCE |
| Date Created | 25/10/2026 |
| Date Last Updated | 25/10/2026 |
| Assigned To | |

## Preconditions
1. The SkyPermit API is available at `{BASE_URL}`.
2. Operator `op-chk-004@test.example` exists with `authorisation_level` = `L1` and `status` = `ACTIVE`, and the API client holds its session cookie.
3. Pilot `Test Pilot CHK-004` (national ID `TEST-PIL-CHK-004`) is registered under that operator with `rating` = `R_BASIC` and `certified_on` = the date 6 months before the test date (for example `2026-04-25` when testing on 25/10/2026), so the certification is still current at the flight window. Its `id` is `{PILOT_ID}`.
4. Aircraft `TestMaker TM-1` (serial `SN-TEST-CHK-004`) is registered under that operator with `mtom_grams` = `800` (band `C0`). Its `id` is `{AIRCRAFT_ID}`. No other flight request exists for this aircraft.
5. Zone `DNI-OPN-1` exists as in the catalogue: class `OPEN`, ceiling 120 m, permitted bands `C0`–`C3`, no curfew, required level `L1`, active.
6. The tester notes the current UTC time as `T0` immediately before step 1, and sends steps 1 and 2 within 5 minutes of `T0`.

## Steps and Expected Results
| # | Step | Expected Result |
|---|---|---|
| 1 | Send `POST {BASE_URL}/api/v1/flight-requests` with the session cookie, header `Content-Type: application/json` and body:<br>`{"pilot_id": "{PILOT_ID}", "aircraft_id": "{AIRCRAFT_ID}", "zone_code": "DNI-OPN-1", "window_start": "<T0 + 59 days 23 h, ISO 8601 UTC>", "window_end": "<T0 + 60 days, ISO 8601 UTC>", "requested_altitude_metres": 50, "flight_purpose": "TC-CHK-004 max advance"}`<br>Note the returned `id` as `{FR_ID}`. | • The response status is `201`.<br>• The response body has `state` = `DRAFT`. |
| 2 | Send `POST {BASE_URL}/api/v1/flight-requests/{FR_ID}/submit` with the session cookie. | • The response status is `200`.<br>• The response body has `state` = `UNDER_REVIEW`. |
| 3 | Send `GET {BASE_URL}/api/v1/flight-requests/{FR_ID}` with the session cookie. | • The response status is `200`.<br>• `state` = `UNDER_REVIEW`.<br>• `failing_gate` and `rule_reference` are empty (`null`). |

## Postconditions
- Flight request `{FR_ID}` is in `UNDER_REVIEW` and now counts in the overlap check for aircraft `{AIRCRAFT_ID}`.
- Cleanup: send `POST {BASE_URL}/api/v1/flight-requests/{FR_ID}/cancel` with the session cookie. To run again, use a new `T0`.

## Priority
2 — if this failed, valid bookings made well in advance would be refused, blocking a main function.

## Source
`06-business-rules.md` §1.4, "Maximum advance booking" (≤ 60 days before `window_start`); §1.1–§1.4, §2 and §4 for the data that passes every other gate (duration 60 min, no curfew, no overlap). `02-state-machine.md`, `DRAFT` submit → `UNDER_REVIEW` when gates pass, and `UNDER_REVIEW` cancel → `CANCELLED`. `01-data-model.md`, FlightRequest (`failing_gate` and `rule_reference` populated only on gate-failure rejection). `public/openapi.yaml`, `POST /flight-requests/{id}/submit` (`200`, moved to `UNDER_REVIEW`).
