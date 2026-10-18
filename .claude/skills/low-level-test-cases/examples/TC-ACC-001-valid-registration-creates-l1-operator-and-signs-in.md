# TC-ACC-001: Registration with all fields valid creates the operator at level L1 and signs them in

| Field | Value |
|---|---|
| ID | TC-ACC-001 |
| Summary | Registration through the API with all operator fields valid creates the operator at authorisation level L1 and signs them in |
| Date Created | 18/10/2026 |
| Date Last Updated | 18/10/2026 |
| Assigned To | |

## Preconditions
1. The SkyPermit API is available at `{BASE_URL}`.
2. No operator exists with email `op-reg-001@test.example` or national ID `TEST-NID-0001`.
3. The tester uses an API client that stores cookies from responses and sends them with later requests (for example Postman, or curl with a cookie jar).
4. The API client holds no SkyPermit session cookie.

## Steps and Expected Results
| # | Step | Expected Result |
|---|---|---|
| 1 | Send `POST {BASE_URL}/api/v1/operators` with header `Content-Type: application/json` and body:<br>`{"email": "op-reg-001@test.example", "password": "TestPass#2026", "legal_name": "Test Operator 001", "national_id": "TEST-NID-0001", "phone": "+380000000001", "address_line": "1 Test Street", "city": "Kyiv", "postal_code": "01001"}` | • The response status is `201`.<br>• The response sets a session cookie, which the API client stores. |
| 2 | Send `GET {BASE_URL}/api/v1/auth/me` with the session cookie from step 1. | • The response is not `401`.<br>• The response body is the operator profile with `email` = `op-reg-001@test.example`, `legal_name` = `Test Operator 001` and `national_id` = `TEST-NID-0001`.<br>• `authorisation_level` = `L1`. |

## Postconditions
- Operator `op-reg-001@test.example` exists at authorisation level L1, and the API client holds a session for it.
- To run the test again, use an email and national ID that no operator has yet.

## Priority
1 — if registration fails, no operator can use the system.

## Source
`03-api-contract.md`, "Authentication & authorisation" (registration creates the account and profile and signs the caller in; `/auth/me` returns the logged-in operator's profile; registration always creates an operator at `L1`). `04-frontend-spec.md`, "Operator portal" (registration logs the operator in immediately and starts them at `L1`). `01-data-model.md`, "Operator" (profile fields). `public/openapi.yaml`, `POST /operators` (`201` on success).
