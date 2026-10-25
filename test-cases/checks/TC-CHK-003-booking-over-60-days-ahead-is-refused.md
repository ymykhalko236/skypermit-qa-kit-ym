# TC-CHK-003: Submission more than 60 days before the window is refused by the time window check

| Field | Value |
|---|---|
| ID | TC-CHK-003 |
| Summary | Submitting a flight request whose `window_start` is 60 days and 1 hour after submission is refused by the `TIME_WINDOW` gate with `rule_reference` `TSD-4 §2.2`, and the request moves to `REJECTED` |
| Business Rule | BR-TIME-MAX-ADVANCE |
| Date Created | 25/10/2026 |
| Date Last Updated | 25/10/2026 |
| Assigned To | |

## Preconditions
1. The SkyPermit API is available at `{BASE_URL}`.
2. Operator `op-chk-003@test.example` exists with `authorisation_level` = `L1` and `status` = `ACTIVE`, and the API client holds its session cookie.
3. Pilot `Test Pilot CHK-003` (national ID `TEST-PIL-CHK-003`) is registered under that operator with `rating` = `R_BASIC` and `certified_on` = the date 6 months before the test date (for example `2026-04-25` when testing on 25/10/2026), so the certification is still current at the flight window. Its `id` is `{PILOT_ID}`.
4. Aircraft `TestMaker TM-1` (serial `SN-TEST-CHK-003`) is registered under that operator with `mtom_grams` = `800` (band `C0`). Its `id` is `{AIRCRAFT_ID}`. No other flight request exists for this aircraft.
5. Zone `DNI-OPN-1` exists as in the catalogue: class `OPEN`, ceiling 120 m, permitted bands `C0`–`C3`, no curfew, required level `L1`, active.
6. The tester notes the current UTC time as `T0` immediately before step 1, and sends steps 1 and 2 within 5 minutes of `T0`.

## Steps and Expected Results
| # | Step | Expected Result |
|---|---|---|
| 1 | Send `POST {BASE_URL}/api/v1/flight-requests` with the session cookie, header `Content-Type: application/json` and body:<br>`{"pilot_id": "{PILOT_ID}", "aircraft_id": "{AIRCRAFT_ID}", "zone_code": "DNI-OPN-1", "window_start": "<T0 + 60 days 1 h, ISO 8601 UTC>", "window_end": "<T0 + 60 days 2 h, ISO 8601 UTC>", "requested_altitude_metres": 50, "flight_purpose": "TC-CHK-003 max advance"}`<br>Note the returned `id` as `{FR_ID}`. | • The response status is `201`.<br>• The response body has `state` = `DRAFT`. |
| 2 | Send `POST {BASE_URL}/api/v1/flight-requests/{FR_ID}/submit` with the session cookie. | • The response status is `422`.<br>• The body has `failing_gate` = `TIME_WINDOW`.<br>• The body has `rule_reference` = `TSD-4 §2.2`.<br>• The body has a non-empty `message` string. |
| 3 | Send `GET {BASE_URL}/api/v1/flight-requests/{FR_ID}` with the session cookie. | • The response status is `200`.<br>• `state` = `REJECTED`.<br>• `failing_gate` = `TIME_WINDOW`.<br>• `rule_reference` = `TSD-4 §2.2`. |

## Postconditions
- Flight request `{FR_ID}` is in `REJECTED`, which is terminal.
- To run the test again, create a new flight request with a new `T0`; the operator, pilot and aircraft can be reused.

## Priority
1 — if this failed, the system would accept bookings further ahead than the rules allow.

## Source
`06-business-rules.md` §1.4, "Maximum advance booking" (≤ 60 days before `window_start`) and §6 (`rule_reference` `TSD-4 §2.2`); §1.1–§1.3, §2 and §4 for the pilot, aircraft and zone data that pass the earlier gates. `03-api-contract.md`, "The `422` body" and "Gate pipeline". `02-state-machine.md`, `DRAFT` submit → `REJECTED` with `failing_gate` populated. `01-data-model.md`, FlightRequest (`failing_gate`, `rule_reference` stored on rejection). `public/openapi.yaml`, `POST /flight-requests` (`201`) and `POST /flight-requests/{id}/submit` (`422`, row updated to `REJECTED`).
