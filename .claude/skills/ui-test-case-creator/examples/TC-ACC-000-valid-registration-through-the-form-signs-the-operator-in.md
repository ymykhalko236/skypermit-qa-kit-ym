# TC-ACC-000: Registration through the form with all required fields valid signs the operator in

| Field | Value |
|---|---|
| ID | TC-ACC-000 |
| Summary | Registration through the form with all required fields valid creates the operator and signs them in |
| Business Rule | N/A |
| Date Created | 06/11/2026 |
| Date Last Updated | 06/11/2026 |
| Assigned To | |

## Preconditions
1. The SkyPermit web app is available at `{BASE_URL}`.
2. No operator exists with email `op-ui-000@test.example` or national ID `TEST-NID-UI-0000`.
3. The browser holds no SkyPermit session, and the Operator role is selected (`role-switcher-operator`).

## Steps and Expected Results
| # | Step | Expected Result |
|---|---|---|
| 1 | Open `{BASE_URL}/register`. | • The registration form `operator-register-form` is shown.<br>• `operator-login-link` and `operator-register-link` are shown in the header. |
| 2 | Enter `op-ui-000@test.example` in the Email field (`operator-register-email-input`). | • The field shows `op-ui-000@test.example`. |
| 3 | Enter `TestPass#2026` in the Password field (`operator-register-password-input`). | • The field shows the password masked. |
| 4 | Enter `Test Operator UI 000` in the Legal name field (`operator-register-legal-name-input`). | • The field shows `Test Operator UI 000`. |
| 5 | Enter `TEST-NID-UI-0000` in the National ID field (`operator-register-national-id-input`). | • The field shows `TEST-NID-UI-0000`. |
| 6 | Click the Register button (`operator-register-submit-button`). | • `operator-register-error` is not shown.<br>• `operator-session-info` shows `Test Operator UI 000`.<br>• `operator-logout-button` is shown.<br>• `operator-login-link` and `operator-register-link` are no longer shown. |

## Postconditions
- Operator `op-ui-000@test.example` exists and is logged in.
- To run the test again, log out and use an email and national ID that no operator has yet.

## Priority
1 — if registration through the form fails, no new operator can use the system.

## Source
[04 - Frontend Spec](https://yaroslavmyhalko236.atlassian.net/wiki/spaces/SD1/pages/98314), "Operator portal" (one combined form that creates the account and logs the operator in immediately) and "Two contracts to hold exactly" (login and register links shown when logged out, session info and logout button shown when logged in). `app/register/page.tsx` (form selectors and required fields). `components/AppHeader.tsx` (header selectors; session info displays the legal name). The starting level `L1` isn't checked here because no screen displays it: that belongs to an API test case.
