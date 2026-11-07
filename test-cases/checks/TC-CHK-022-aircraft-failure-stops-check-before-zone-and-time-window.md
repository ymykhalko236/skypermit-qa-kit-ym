# TC-CHK-022: An aircraft check failure stops the check: PILOT is shown as passed, ZONE and TIME_WINDOW aren't evaluated

| Field | Value |
|---|---|
| ID | TC-CHK-022 |
| Summary | When "Check before submitting" fails at the `AIRCRAFT` gate (12,001 g aircraft in `KBP-CTR-3`), the earlier `PILOT` gate is shown as passed and the later `ZONE` and `TIME_WINDOW` gates are shown as neither passed nor failed, because evaluation stops at the first failure |
| Business Rule | BR-AIRCRAFT-WEIGHT-BAND |
| Date Created | 07/11/2026 |
| Date Last Updated | 07/11/2026 |
| Assigned To | |

## Preconditions
1. The SkyPermit web app is available at `{BASE_URL}`, and the browser's time zone is `Europe/Kyiv`, because the window fields use the browser's time zone.
2. Operator `op-chk-022@test.example` exists with status `ACTIVE` and authorisation level `L2`, raised by an admin because registration creates `L1`. The operator is logged in, with the Operator role selected (`role-switcher-operator`).
3. Pilot `Test Pilot CHK-022` (national ID `TEST-PIL-CHK-022`) is registered under that operator with rating `R_ADVANCED` and `certified_on` = the date 6 months before the test date, so the certification is current.
4. An aircraft with manufacturer `TestMaker`, model `TM-C3` and serial number `SN-TEST-CHK-022` is registered under that operator with `mtom_grams` = `12001` (band `C3`). No other flight request for this aircraft is in `APPROVED` or `UNDER_REVIEW`.
5. Zone `KBP-CTR-3` exists as in the catalogue: class `CONTROLLED`, ceiling 120 m, permitted bands `C0`–`C2`, curfew 23:00–05:00 local, required level `L2`, active.
6. `D` is the date 3 days after the test date, for example `10/11/2026` when testing on `07/11/2026`. The window doesn't fall on a daylight saving change date.

## Steps and Expected Results
| # | Step | Expected Result |
|---|---|---|
| 1 | Open `{BASE_URL}/operator/requests/new`. | • The form `flight-request-create-form` is shown. |
| 2 | Select `KBP-CTR-3 — Kyiv Boryspil Corridor 3` in the Zone field (`flight-request-zone-select`). | • The field shows `KBP-CTR-3 — Kyiv Boryspil Corridor 3`. |
| 3 | Select `Test Pilot CHK-022 (R_ADVANCED)` in the Pilot field (`flight-request-pilot-select`). | • The field shows `Test Pilot CHK-022 (R_ADVANCED)`. |
| 4 | Select `TestMaker TM-C3 (SN-TEST-CHK-022)` in the Aircraft field (`flight-request-aircraft-select`). | • The field shows `TestMaker TM-C3 (SN-TEST-CHK-022)`. |
| 5 | Enter date `D` and time `10:00` in the Window start field (`flight-request-window-start-input`). | • The field shows date `D` and time `10:00`. |
| 6 | Enter date `D` and time `11:00` in the Window end field (`flight-request-window-end-input`). | • The field shows date `D` and time `11:00`. |
| 7 | Enter `100` in the Altitude field (`flight-request-altitude-input`). | • The field shows `100`. |
| 8 | Click the Create request button (`flight-request-create-submit-button`). | • `flight-request-create-error` is not shown.<br>• The panel `flight-request-detail` is shown.<br>• The `flight-request-detail-state` badge shows `DRAFT`. |
| 9 | Click the Check before submitting button (`flight-request-validate-button`). | • The card `flight-request-gate-result-PILOT` has `data-gate-status` = `PASS` and shows a pass badge.<br>• The card `flight-request-gate-result-AIRCRAFT` has `data-gate-status` = `FAIL`.<br>• The cards `flight-request-gate-result-ZONE` and `flight-request-gate-result-TIME_WINDOW` show neither a pass badge nor a fail badge.<br>• **TBC:** the cards `flight-request-gate-result-ZONE` and `flight-request-gate-result-TIME_WINDOW` are marked as not evaluated. The code shows `data-gate-status` = `NOT_EVALUATED` with a "not evaluated" badge, but the docs don't say how a gate that wasn't reached is shown. |

## Postconditions
- The flight request is still in `DRAFT`.
- Cleanup: click the Cancel request button (`flight-request-cancel-button`), which moves the request to `CANCELLED`. The test can then be run again with the same data.

## Priority
2 — if the check showed results for gates it never ran, the operator would be told a zone or time window passes or fails when it was never evaluated.

## Source
[06 - Business Rules](https://yaroslavmyhalko236.atlassian.net/wiki/spaces/SD1/pages/688129), "Evaluation order" (`PILOT` → `AIRCRAFT` → `ZONE` → `TIME_WINDOW`, evaluation stops at the first failure), §1.1 (`R_ADVANCED` covers `CONTROLLED`; certification current for 18 months), §1.2 and §3 (12,001 g is `C3`, not permitted in a `C0`–`C2` zone) and §4 (`KBP-CTR-3` zone values). [07 - Clarifications](https://yaroslavmyhalko236.atlassian.net/wiki/spaces/SD1/pages/589846) item 1 (the weight-band check belongs to `AIRCRAFT`). [03 - API Contract](https://yaroslavmyhalko236.atlassian.net/wiki/spaces/SD1/pages/622593), "Gate pipeline" (fixed order, stopping at the first failure) and "Flight requests" endpoint 13 (`validate` runs every gate exactly as `submit` would, in the same order). [04 - Frontend Spec](https://yaroslavmyhalko236.atlassian.net/wiki/spaces/SD1/pages/98314), "Operator portal" ("Check before submitting" shows a per-gate pass/fail result). [02 - State Machine](https://yaroslavmyhalko236.atlassian.net/wiki/spaces/SD1/pages/196808), transitions table (`DRAFT` cancel to `CANCELLED`, used for cleanup). SKY-7 acceptance criterion 3 (`reports/jira-intake/SKY-7.json`). `app/operator/requests/new/page.tsx`, `components/FlightRequestPanel.tsx` and `components/GateResultsPanel.tsx` (selectors, gate cards and `data-gate-status` values).

**To be confirmed:** the docs say that evaluation stops at the first failure, and that the check shows a per-gate pass/fail result. They don't say how the panel shows a gate that wasn't reached. The code shows it with `data-gate-status` = `NOT_EVALUATED` and a "not evaluated" badge (`components/GateResultsPanel.tsx:13-21`, `:42-45`). The docs owner needs to confirm this display before the TBC result can be judged.
