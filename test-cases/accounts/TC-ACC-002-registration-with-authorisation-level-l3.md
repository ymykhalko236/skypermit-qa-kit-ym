# TC-ACC-002: Registration that sends authorisation level L3 doesn't create an operator above L1

| Field | Value |
|---|---|
| ID | TC-ACC-002 |
| Summary | Registration through the API that includes `authorisation_level` = `L3` in the request doesn't create an operator above `L1`; whether the request is refused or accepted with the field ignored is to be confirmed |
| Date Created | 18/10/2026 |
| Date Last Updated | 18/10/2026 |
| Assigned To | |

## Preconditions
1. The SkyPermit API is available at `{BASE_URL}`.
2. No operator exists with email `op-reg-002@test.example` or national ID `TEST-NID-0002`.
3. The tester uses an API client that stores cookies from responses and sends them with later requests (for example Postman, or curl with a cookie jar).
4. The API client holds no SkyPermit session cookie.

## Steps and Expected Results
| # | Step | Expected Result |
|---|---|---|
| 1 | Send `POST {BASE_URL}/api/v1/operators` with header `Content-Type: application/json` and body:<br>`{"email": "op-reg-002@test.example", "password": "TestPass#2026", "legal_name": "Test Operator 002", "national_id": "TEST-NID-0002", "phone": "+380000000002", "address_line": "2 Test Street", "city": "Kyiv", "postal_code": "01001", "authorisation_level": "L3"}` | • **TBC:** either the request is refused (`400`, JSON body with an `error` field, no session cookie), or it is accepted with the field ignored (`201`, session cookie set). The correct behaviour hasn't been decided. |
| 2 | Send `GET {BASE_URL}/api/v1/auth/me`, with the session cookie from step 1 if one was set. | • If step 1 was refused: the response status is `401`.<br>• If step 1 was accepted: the response body is the operator profile for `op-reg-002@test.example` with `authorisation_level` = `L1`.<br>• In either case, no response shows `authorisation_level` = `L2` or `L3`. |
| 3 | Send `POST {BASE_URL}/api/v1/auth/login` with header `Content-Type: application/json` and body:<br>`{"email": "op-reg-002@test.example", "password": "TestPass#2026"}` | • **TBC:** if step 1 was refused, the response status is `401` and no session cookie is set, because no account was created. If step 1 was accepted, the response status is `200` and the body shows `authorisation_level` = `L1`. |

## Postconditions
- If the request was refused: no operator account exists for `op-reg-002@test.example` or `TEST-NID-0002`, and the test can be run again with the same data.
- If the request was accepted: operator `op-reg-002@test.example` exists at level L1. To run the test again, use an email and national ID that no operator has yet.

## Priority
1 — if this failed, an operator could grant themselves a higher authorisation level, which the rules forbid.

## Source
`03-api-contract.md`, "Authentication & authorisation" (`authorisation_level` is no longer self-service; registration always creates an operator at `L1`; raising it is an out-of-band admin action). `04-frontend-spec.md`, "Operator portal" (`authorisation_level` is not a registration field). `public/openapi.yaml`, `POST /operators` (`201`), `BadRequest` and `Error` responses (`400` body with an `error` field), `/auth/login` (`200`, `401`).

**To be confirmed:** whether a registration request that includes `authorisation_level` is refused with `400` or accepted with the field ignored. Neither the docs nor `openapi.yaml` say which. Chat decision, 18/10/2026: leave as TBC until the owner of the API contract confirms.
