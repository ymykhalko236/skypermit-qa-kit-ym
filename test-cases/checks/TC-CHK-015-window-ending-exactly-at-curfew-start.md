# TC-CHK-015: A window ending exactly at the KBP-CTR-3 curfew start (outcome to be confirmed)

| Field | Value |
|---|---|
| ID | TC-CHK-015 |
| Summary | A window of 22:15–23:00 local, ending exactly when the `KBP-CTR-3` curfew starts: whether it is refused or passes is to be confirmed |
| Business Rule | BR-TIME-CURFEW-A7 |
| Date Created | 06/11/2026 |
| Date Last Updated | 06/11/2026 |
| Assigned To | |

## Preconditions
1. The SkyPermit web app is available at `{BASE_URL}`, and the browser's time zone is `Europe/Kyiv`, because the window fields use the browser's time zone.
2. Operator `op-chk-015@test.example` exists with status `ACTIVE` and authorisation level `L2`, raised by an admin because registration creates `L1`. The operator is logged in, with the Operator role selected (`role-switcher-operator`).
3. Pilot `Test Pilot CHK-015` (national ID `TEST-PIL-CHK-015`) is registered under that operator with rating `R_ADVANCED` and `certified_on` = the date 6 months before the test date, so the certification is current.
4. An aircraft with manufacturer `TestMaker`, model `TM-1` and serial number `SN-TEST-CHK-015` is registered under that operator with `mtom_grams` = `800` (band `C0`). No other flight request for this aircraft is in `APPROVED` or `UNDER_REVIEW`.
5. Zone `KBP-CTR-3` exists as in the catalogue: class `CONTROLLED`, ceiling 120 m, permitted bands `C0`–`C2`, curfew 23:00–05:00 local, required level `L2`, active.
6. `D` is the date 3 days after the test date, for example `09/11/2026` when testing on `06/11/2026`. The window doesn't fall on a daylight saving change date.
7. The browser's developer tools are open on the Network tab, with "Preserve log" on. `{FR_ID}` below is the request's id, shown in the `validate` request URL.

## Steps and Expected Results
| # | Step | Expected Result |
|---|---|---|
| 1 | Open `{BASE_URL}/operator/requests/new`. | • The form `flight-request-create-form` is shown. |
| 2 | Select `KBP-CTR-3 — Kyiv Boryspil Corridor 3` in the Zone field (`flight-request-zone-select`). | • The field shows `KBP-CTR-3 — Kyiv Boryspil Corridor 3`. |
| 3 | Select `Test Pilot CHK-015 (R_ADVANCED)` in the Pilot field (`flight-request-pilot-select`). | • The field shows `Test Pilot CHK-015 (R_ADVANCED)`. |
| 4 | Select `TestMaker TM-1 (SN-TEST-CHK-015)` in the Aircraft field (`flight-request-aircraft-select`). | • The field shows `TestMaker TM-1 (SN-TEST-CHK-015)`. |
| 5 | Enter date `D` and time `22:15` in the Window start field (`flight-request-window-start-input`). | • The field shows date `D` and time `22:15`. |
| 6 | Enter date `D` and time `23:00` in the Window end field (`flight-request-window-end-input`). | • The field shows date `D` and time `23:00`. |
| 7 | Enter `100` in the Altitude field (`flight-request-altitude-input`). | • The field shows `100`. |
| 8 | Click the Create request button (`flight-request-create-submit-button`). | • `flight-request-create-error` is not shown.<br>• The panel `flight-request-detail` is shown.<br>• The `flight-request-detail-state` badge shows `DRAFT`. |
| 9 | Click the Check before submitting button (`flight-request-validate-button`). | • **TBC:** one of two outcomes, to be confirmed by the rules owner. (a) Refused: the `POST {BASE_URL}/api/v1/flight-requests/{FR_ID}/validate` response has status `422` with `failing_gate` = `TIME_WINDOW` and `rule_reference` = `A-7 §1`, and the `flight-request-gate-result-TIME_WINDOW` card has `data-gate-status` = `FAIL` and shows `A-7 §1`. (b) Passed: the `POST {BASE_URL}/api/v1/flight-requests/{FR_ID}/validate` response has status `200` with body `{"ok": true}`, and the `flight-request-gate-result-TIME_WINDOW` card has `data-gate-status` = `PASS`.<br>• The `flight-request-gate-result-PILOT` card has `data-gate-status` = `PASS` and shows the `pass` badge.<br>• The `flight-request-gate-result-AIRCRAFT` card has `data-gate-status` = `PASS` and shows the `pass` badge.<br>• The `flight-request-gate-result-ZONE` card has `data-gate-status` = `PASS` and shows the `pass` badge.<br>• The `flight-request-detail-state` badge still shows `DRAFT`. |

## Postconditions
- After the last step, the flight request is still in `DRAFT`.
- Cleanup: click the Cancel request button (`flight-request-cancel-button`), which moves the request to `CANCELLED`. The test can then be run again with the same data.

## Priority
1 — if the window should be refused and isn't, a forbidden flight would be allowed.

## Source
[06 - Business Rules](https://yaroslavmyhalko236.atlassian.net/wiki/spaces/SD1/pages/688129) §1.4 (curfew rule and `KBP-CTR-3` curfew value), §4 (zone catalogue) and §6 (`rule_reference` `A-7 §1`). [02 - State Machine](https://yaroslavmyhalko236.atlassian.net/wiki/spaces/SD1/pages/196808), transitions table (`DRAFT` cancel to `CANCELLED`, used for cleanup). [03 - API Contract](https://yaroslavmyhalko236.atlassian.net/wiki/spaces/SD1/pages/622593), "Flight requests" endpoint 13 (`validate` never changes state) and "The `422` body". [04 - Frontend Spec](https://yaroslavmyhalko236.atlassian.net/wiki/spaces/SD1/pages/98314), "Operator portal" (request creation form, "Check before submitting" shows a per-gate result without changing state). [01 - Data Model](https://yaroslavmyhalko236.atlassian.net/wiki/spaces/SD1/pages/589825), "Time handling". SKY-5 acceptance criteria (`reports/jira-intake/SKY-5.json`). `app/operator/requests/new/page.tsx`, `components/FlightRequestPanel.tsx` and `components/GateResultsPanel.tsx` (selectors and gate cards; `new/page.tsx` also converts the window fields from the browser's time zone). `lib/curfew.ts` (current curfew check). Chat decision, 06/11/2026: zone-local time for `KBP-CTR-3` is `Europe/Kyiv`. Chat decision, 06/11/2026: this test case also checks the network response, not only the text in the interface.

**To be confirmed:** whether a window that only touches the curfew start counts as falling inside the curfew. `06 - Business Rules` §1.4 says no part of the window may fall inside the curfew, but doesn't say whether the instant 23:00 is inside it. The "touching windows don't overlap" wording in the same table applies only to the overlap rule. The code currently refuses this window (`lib/curfew.ts`). The rules owner needs to decide.
