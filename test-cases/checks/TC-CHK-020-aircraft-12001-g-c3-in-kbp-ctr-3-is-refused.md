# TC-CHK-020: Aircraft of 12,001 g (band C3) in zone KBP-CTR-3 is refused by the aircraft check

| Field | Value |
|---|---|
| ID | TC-CHK-020 |
| Summary | "Check before submitting" on a request that uses a 12,001 g aircraft (band `C3`) in zone `KBP-CTR-3`, which permits only `C0`–`C2`, shows the `AIRCRAFT` gate as failed, and the request stays in `DRAFT` |
| Business Rule | BR-AIRCRAFT-WEIGHT-BAND |
| Date Created | 07/11/2026 |
| Date Last Updated | 07/11/2026 |
| Assigned To | |

## Preconditions
1. The SkyPermit web app is available at `{BASE_URL}`, and the browser's time zone is `Europe/Kyiv`, because the window fields use the browser's time zone.
2. Operator `op-chk-020@test.example` exists with status `ACTIVE` and authorisation level `L2`, raised by an admin because registration creates `L1`. The operator is logged in, with the Operator role selected (`role-switcher-operator`).
3. Pilot `Test Pilot CHK-020` (national ID `TEST-PIL-CHK-020`) is registered under that operator with rating `R_ADVANCED` and `certified_on` = the date 6 months before the test date, so the certification is current.
4. An aircraft with manufacturer `TestMaker`, model `TM-C3` and serial number `SN-TEST-CHK-020` is registered under that operator with `mtom_grams` = `12001` (band `C3`). No other flight request for this aircraft is in `APPROVED` or `UNDER_REVIEW`.
5. Zone `KBP-CTR-3` exists as in the catalogue: class `CONTROLLED`, ceiling 120 m, permitted bands `C0`–`C2`, curfew 23:00–05:00 local, required level `L2`, active.
6. `D` is the date 3 days after the test date, for example `10/11/2026` when testing on `07/11/2026`. The window doesn't fall on a daylight saving change date.

## Steps and Expected Results
| # | Step | Expected Result |
|---|---|---|
| 1 | Open `{BASE_URL}/operator/requests/new`. | • The form `flight-request-create-form` is shown. |
| 2 | Select `KBP-CTR-3 — Kyiv Boryspil Corridor 3` in the Zone field (`flight-request-zone-select`). | • The field shows `KBP-CTR-3 — Kyiv Boryspil Corridor 3`. |
| 3 | Select `Test Pilot CHK-020 (R_ADVANCED)` in the Pilot field (`flight-request-pilot-select`). | • The field shows `Test Pilot CHK-020 (R_ADVANCED)`. |
| 4 | Select `TestMaker TM-C3 (SN-TEST-CHK-020)` in the Aircraft field (`flight-request-aircraft-select`). | • The option `TestMaker TM-C3 (SN-TEST-CHK-020)` is offered and can be selected, although its band `C3` isn't permitted in `KBP-CTR-3`.<br>• The field shows `TestMaker TM-C3 (SN-TEST-CHK-020)`. |
| 5 | Enter date `D` and time `10:00` in the Window start field (`flight-request-window-start-input`). | • The field shows date `D` and time `10:00`. |
| 6 | Enter date `D` and time `11:00` in the Window end field (`flight-request-window-end-input`). | • The field shows date `D` and time `11:00`. |
| 7 | Enter `100` in the Altitude field (`flight-request-altitude-input`). | • The field shows `100`. |
| 8 | Click the Create request button (`flight-request-create-submit-button`). | • `flight-request-create-error` is not shown.<br>• The panel `flight-request-detail` is shown.<br>• The `flight-request-detail-state` badge shows `DRAFT`. |
| 9 | Click the Check before submitting button (`flight-request-validate-button`). | • The card `flight-request-gate-result-AIRCRAFT` has `data-gate-status` = `FAIL` and shows a fail badge.<br>• **TBC:** the card `flight-request-gate-result-AIRCRAFT` shows the rule reference `ZC-2026.1 §2`. Either it is shown on the check result, or the docs require it only on the detail view of a rejected request.<br>• The `flight-request-detail-state` badge still shows `DRAFT`. |

## Postconditions
- The flight request is still in `DRAFT`.
- Cleanup: click the Cancel request button (`flight-request-cancel-button`), which moves the request to `CANCELLED`. The test can then be run again with the same data.

## Priority
1 — if this failed, an aircraft too heavy for the zone would pass the check, allowing a flight the rules forbid.

## Source
[06 - Business Rules](https://yaroslavmyhalko236.atlassian.net/wiki/spaces/SD1/pages/688129) §1.2 (`AIRCRAFT`: the weight band must be one of the zone's `permitted_bands`), §3 (`C3` is above 12,000 g up to 30,000 g), §4 (`KBP-CTR-3` permits `C0`–`C2`) and §6 (`rule_reference` `ZC-2026.1 §2`). [07 - Clarifications](https://yaroslavmyhalko236.atlassian.net/wiki/spaces/SD1/pages/589846) item 1 (the weight-band check belongs to `AIRCRAFT`, not `ZONE`). [04 - Frontend Spec](https://yaroslavmyhalko236.atlassian.net/wiki/spaces/SD1/pages/98314), "Operator portal" ("Check before submitting" shows a per-gate pass/fail result without changing state) and "Two contracts to hold exactly" (the form does not pre-filter). [03 - API Contract](https://yaroslavmyhalko236.atlassian.net/wiki/spaces/SD1/pages/622593), "Flight requests" endpoint 13 (`validate` never changes state). [02 - State Machine](https://yaroslavmyhalko236.atlassian.net/wiki/spaces/SD1/pages/196808), transitions table (`DRAFT` cancel to `CANCELLED`, used for cleanup). SKY-7 acceptance criteria 1, 2 and 5 (`reports/jira-intake/SKY-7.json`). `app/operator/requests/new/page.tsx`, `components/FlightRequestPanel.tsx` and `components/GateResultsPanel.tsx` (selectors, gate cards and `data-gate-status` values).

**To be confirmed:** SKY-7 criterion 2 expects the check to show the rule reference `ZC-2026.1 §2`. `04 - Frontend Spec` promises a rule reference only on the request detail view of a rejected request, and says the check shows a per-gate pass/fail result. The code currently shows the rule reference on the failed card (`components/GateResultsPanel.tsx:48-52`). The docs owner or the SKY-7 owner needs to confirm whether the check panel must show it.
