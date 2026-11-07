# TC-CHK-021: Aircraft of exactly 12,000 g (band C2) in zone KBP-CTR-3 passes the aircraft check

| Field | Value |
|---|---|
| ID | TC-CHK-021 |
| Summary | "Check before submitting" on a request that uses an aircraft of exactly 12,000 g (band `C2`) in zone `KBP-CTR-3`, with every other gate's data valid, shows the `AIRCRAFT` gate as passed |
| Business Rule | BR-AIRCRAFT-WEIGHT-BAND |
| Date Created | 07/11/2026 |
| Date Last Updated | 07/11/2026 |
| Assigned To | |

## Preconditions
1. The SkyPermit web app is available at `{BASE_URL}`, and the browser's time zone is `Europe/Kyiv`, because the window fields use the browser's time zone.
2. Operator `op-chk-021@test.example` exists with status `ACTIVE` and authorisation level `L2`, raised by an admin because registration creates `L1`. The operator is logged in, with the Operator role selected (`role-switcher-operator`).
3. Pilot `Test Pilot CHK-021` (national ID `TEST-PIL-CHK-021`) is registered under that operator with rating `R_ADVANCED` and `certified_on` = the date 6 months before the test date, so the certification is current.
4. An aircraft with manufacturer `TestMaker`, model `TM-C2` and serial number `SN-TEST-CHK-021` is registered under that operator with `mtom_grams` = `12000` (band `C2`). No other flight request for this aircraft is in `APPROVED` or `UNDER_REVIEW`.
5. Zone `KBP-CTR-3` exists as in the catalogue: class `CONTROLLED`, ceiling 120 m, permitted bands `C0`–`C2`, curfew 23:00–05:00 local, required level `L2`, active.
6. `D` is the date 3 days after the test date, for example `10/11/2026` when testing on `07/11/2026`. The window doesn't fall on a daylight saving change date.

## Steps and Expected Results
| # | Step | Expected Result |
|---|---|---|
| 1 | Open `{BASE_URL}/operator/requests/new`. | • The form `flight-request-create-form` is shown. |
| 2 | Select `KBP-CTR-3 — Kyiv Boryspil Corridor 3` in the Zone field (`flight-request-zone-select`). | • The field shows `KBP-CTR-3 — Kyiv Boryspil Corridor 3`. |
| 3 | Select `Test Pilot CHK-021 (R_ADVANCED)` in the Pilot field (`flight-request-pilot-select`). | • The field shows `Test Pilot CHK-021 (R_ADVANCED)`. |
| 4 | Select `TestMaker TM-C2 (SN-TEST-CHK-021)` in the Aircraft field (`flight-request-aircraft-select`). | • The field shows `TestMaker TM-C2 (SN-TEST-CHK-021)`. |
| 5 | Enter date `D` and time `10:00` in the Window start field (`flight-request-window-start-input`). | • The field shows date `D` and time `10:00`. |
| 6 | Enter date `D` and time `11:00` in the Window end field (`flight-request-window-end-input`). | • The field shows date `D` and time `11:00`. |
| 7 | Enter `100` in the Altitude field (`flight-request-altitude-input`). | • The field shows `100`. |
| 8 | Click the Create request button (`flight-request-create-submit-button`). | • `flight-request-create-error` is not shown.<br>• The panel `flight-request-detail` is shown.<br>• The `flight-request-detail-state` badge shows `DRAFT`. |
| 9 | Click the Check before submitting button (`flight-request-validate-button`). | • The card `flight-request-gate-result-AIRCRAFT` has `data-gate-status` = `PASS` and shows a pass badge.<br>• The cards `flight-request-gate-result-PILOT`, `flight-request-gate-result-ZONE` and `flight-request-gate-result-TIME_WINDOW` each have `data-gate-status` = `PASS`.<br>• No gate card has `data-gate-status` = `FAIL`.<br>• The `flight-request-detail-state` badge still shows `DRAFT`. |

## Postconditions
- The flight request is still in `DRAFT`.
- Cleanup: click the Cancel request button (`flight-request-cancel-button`), which moves the request to `CANCELLED`. The test can then be run again with the same data.

## Priority
2 — if this failed, aircraft at the top of band `C2` would be refused in zones that permit them, blocking valid flights with no workaround.

## Source
[06 - Business Rules](https://yaroslavmyhalko236.atlassian.net/wiki/spaces/SD1/pages/688129) §3 (exactly 12,000 g is `C2`, upper bound inclusive), §1.2 (`AIRCRAFT`: the weight band must be one of the zone's `permitted_bands`) and §4 (`KBP-CTR-3` permits `C0`–`C2`, class `CONTROLLED`, ceiling 120 m, required level `L2`, curfew 23:00–05:00). §1.1, §1.3 and §1.4 for the data that passes every other gate (`R_ADVANCED` covers `CONTROLLED`, certification current, altitude 100 m within the ceiling, operator level `L2`, a 60-minute window 3 days ahead outside the curfew, no overlap). [07 - Clarifications](https://yaroslavmyhalko236.atlassian.net/wiki/spaces/SD1/pages/589846) item 1 (the weight-band check belongs to `AIRCRAFT`). [04 - Frontend Spec](https://yaroslavmyhalko236.atlassian.net/wiki/spaces/SD1/pages/98314), "Operator portal" ("Check before submitting" shows a per-gate pass/fail result without changing state). [02 - State Machine](https://yaroslavmyhalko236.atlassian.net/wiki/spaces/SD1/pages/196808), transitions table (`DRAFT` cancel to `CANCELLED`, used for cleanup). SKY-7 acceptance criterion 4 (`reports/jira-intake/SKY-7.json`). `app/operator/requests/new/page.tsx`, `components/FlightRequestPanel.tsx` and `components/GateResultsPanel.tsx` (selectors, gate cards and `data-gate-status` values).
