---
name: api-test-case-creator
description: Generate low-level, atomic API test cases for ONE SkyPermit business rule as Markdown files in test-cases/api/, one file per test case, with IDs API-OP-001, API-OP-002 and so on. Steps are HTTP requests to /api/v1 (method, path, body, and either an operator session or X-Reviewer-Id, never both). Expected results are the status code and, for 422, the body's failing_gate, rule_reference and message. Endpoints and status codes come from the Confluence page 03 - API Contract, and rules from 06 - Business Rules (as corrected by 07 - Clarifications). It uses boundary value analysis and equivalence partitioning as separate checks through POST /flight-requests/{id}/validate, and state transition testing as request chains (validate then GET, submit to REJECTED, repeated submit to 409), which later become a Postman collection. Use it whenever the user asks to write, generate, create, add or update API test cases, request/response checks or status-code checks for a business rule, gate or endpoint, even if they don't name the skill. For UI/E2E test cases, use ui-test-case-creator, never this skill. Don't use it for test plans, Postman collections (use postman-collection-builder) or automated test scripts.
argument-hint: "<business rule ID or description, e.g. BR-TIME-DURATION>"
model: sonnet
allowed-tools: Read, Glob, Grep, Write(test-cases/api/**), Bash(node .claude/skills/cover-gaps/scripts/find_gaps.mjs *), mcp__atlassian__getConfluencePage, mcp__atlassian__getPagesInConfluenceSpace, mcp__atlassian__getConfluencePageDescendants, mcp__atlassian__searchConfluenceUsingCql
---

# API test case creator

A low-level API test case is concrete enough for any tester, or for `postman-collection-builder`, to send exactly the same requests and reach the same verdict without guessing. It is **atomic**: it checks one test condition, such as one boundary value, one partition or one state transition, so it fails for exactly one reason.

This skill writes **only API test cases**, for **one business rule per run**. Each step is an HTTP request to `/api/v1`, and each expected result is what the response says: the status code and, for `422`, the gate failure body. Nothing goes through the web interface.

## When not to use this skill

| The user wants to… | Use instead |
|---|---|
| write or update UI/E2E test cases (forms, screens, `data-testid`) | `ui-test-case-creator`. Always. Never write a UI test case here. |
| review a test case against the docs and the code | `test-case-reviewer` subagent |
| find business rules that have no test case | `cover-gaps` |
| build a Postman collection from these cases | `postman-collection-builder` |
| run a collection | `postman-cli-run` |
| write a test plan | `one-page-test-plan` (ask first whether they want a full or a one-page plan) |
| write automated test scripts | not this kit |

## 1. Pick the rule and read the sources

**One rule per run.** The input is a business rule ID from `find_gaps.mjs` (for example `BR-TIME-DURATION`) or a description of one rule. If the user names several rules, a whole gate or an endpoint, ask which single rule to start with. List the IDs with:

```
node .claude/skills/cover-gaps/scripts/find_gaps.mjs --max 50
```

The script reads a local copy of `06 - Business Rules` (see the exception in `CLAUDE.md`). If its rule list disagrees with Confluence, follow Confluence and tell the user the local copy may be out of date.

Read the Confluence pages in the **SkyPermit Docs** space (key `SD1`) with `getConfluencePage` (`contentFormat: "markdown"`). Page IDs and how the pages relate are in `CLAUDE.md`:

| What | Where |
|---|---|
| Endpoints, methods, auth, status codes, the `422` body, gate order | `03 - API Contract` (622593) |
| The rule's condition, limits and its `rule_reference` value (§6) | `06 - Business Rules` (688129) |
| Corrections to `06` (they win when the two disagree) | `07 - Clarifications` (589846) |
| Which questions are still open | `05 - Open Questions` (655361) |
| Legal and illegal transitions, and which return `409` | `02 - State Machine` (196808) |
| Field names and types | `01 - Data Model` (589825) |

You may also read `../ct-gen-ai-skypermit/public/openapi.yaml` for request body field names, required fields and response shapes that Confluence leaves out, such as the `200` body of `validate` (`{ "ok": true }`). If it contradicts Confluence, follow Confluence and tell the user about the conflict. Don't take expected results from the code. Don't read requirements from `../ct-gen-ai-skypermit/docs/`. If Confluence can't be reached, stop and tell the user.

**Never use a `data-testid`** in an API test case, and don't read the UI code to find one.

Chat decisions are valid sources when the docs are silent. Cite them as "Chat decision, dd/mm/yyyy: <what was decided>". Confluence and the SkyPermit repo are read-only.

Every expected result must be traceable to the source. If the source doesn't say what should happen, ask or report a gap, never guess.

## 2. Break the rule into atomic test cases

Use three techniques. Note which one produced each planned test case.

### Boundary value analysis and equivalence partitioning: separate checks through `validate`

Each BVA or EP test case is **one check** through `POST /flight-requests/{id}/validate`. `validate` runs every gate exactly as `submit` does and never changes state, so it can be repeated safely (`03 - API Contract`, endpoint 13).

- **Boundary value analysis (2-value):** for each ordered limit in the rule, test the boundary value and its closest neighbour in the adjacent partition, with the step size from the source. For example, duration 15–240 minutes gives 14, 15, 240 and 241. A ceiling of 120 m gives 120 and 121.
- **Equivalence partitioning:** one test case per valid and invalid partition the rule defines, for example a pilot rating that covers the zone class and one that doesn't. Add a partition test case only where no boundary test case already reaches that partition.
- **The tested value lives in the flight request** (or its pilot, aircraft or zone), created in **Preconditions**. `POST /flight-requests` checks only formats, not the rules, so a `DRAFT` can hold a value the rules refuse. The single step is the `validate` call.
- **Keep every other gate passing.** Gates run `PILOT` → `AIRCRAFT` → `ZONE` → `TIME_WINDOW` and the response names only the first failure, so every value not under test must pass every gate. Say so in Preconditions, with the values that make it true.
- **Expected results:** an invalid value gives `422` with `failing_gate`, `rule_reference` and `message`; a valid value gives `200` with `ok` `true`.

### State transition testing: request chains

State transition test cases are **request chains**: several requests in one case, in the order they must be sent, because the transition only shows across calls. Use the rule's **failing** value (from the BVA or EP list) so the chain is tied to this rule. Each chain becomes a folder of requests in a Postman collection, so give each request its own row and its own expected results. Write these three chains per rule:

| Chain | Requests | What it proves |
|---|---|---|
| `validate` → `GET` | `POST .../validate` (`422`), then `GET /flight-requests/{id}` | `validate` doesn't change state: `state` is still `DRAFT` |
| `submit` → `REJECTED` | `POST .../submit` (`422`), then `GET /flight-requests/{id}` | the failed gates move `DRAFT` to `REJECTED` (via the transient `SUBMITTED`), with `failing_gate` and `rule_reference` stored |
| repeated `submit` → `409` | `POST .../submit` (`422`), then `POST .../submit` again | `REJECTED` is terminal: a second submit is an illegal transition and returns `409` |

Take the states, the transitions and the `409` rule from `02 - State Machine`. Add other chains (for example `submit` → `UNDER_REVIEW` with a passing value, `cancel`, `approve`/`reject`) only when the user asks for them.

A chain is still atomic: it tests one transition. Earlier requests in the chain only bring the request into the start state of that transition.

### Authorisation in each request

Every request names **exactly one** identity, never both:

- `Auth: operator session of op-api-shared@test.example`: the session cookie set by `POST /auth/login` for the shared operator. Use it for anything the owning operator does: create, `validate`, `submit`, `cancel`, `GET`.
- `Auth: X-Reviewer-Id: <value>` (for example `reviewer-test-01`): only for reviewer endpoints (`approve`, `reject`), or for a reviewer reading or validating any operator's request.

`submit` and `cancel` are owning-operator only (`03 - API Contract`). Don't send `X-Reviewer-Id` to them in a positive test. Testing a wrong or missing identity (`401`, `403`, `400`) is not part of a business-rule run. Offer it to the user as a separate request.

### Test accounts: the shared operator

Every API case acts as **one permanent operator**, recorded in `api-automation/test-accounts.json` (key `shared`): `op-api-shared@test.example`, `L1`, `ACTIVE`. Read that file at the start of every run and use its values.

- **Log in, never register.** Precondition 2 is always a `POST /auth/login` as that operator. Never put `POST /operators` for it in a case: the email already exists, so a second registration fails.
- **The password is a secret.** Name it as the secret `operatorPassword`, read from the OS variable `SKYPERMIT_OPERATOR_PASSWORD` (`env` source in `postman-collection-builder`). Never write, ask for or print its value.
- **Pilot and aircraft are fresh in every run**, made with `{stamp}` and shared by all the cases in that run. A reused pilot would stop being current 18 months after `certified_on` (`OH-1 §2.3`), and a reused aircraft would collect `UNDER_REVIEW`/`APPROVED` requests that trip the overlap rule (`TSD-4 §5`) in later runs. Give them the same names in every case (`Test Pilot API`, `TEST-PIL-API-{stamp}`, `SN-TEST-{stamp}`), so the builder can make them one shared `SETUP`.
- **One new flight request per case.** Requests can't be deleted, so they stay under the operator. Cases read only their own request by `id`, so that is harmless.
- **Don't change the account.** Never suspend it or raise its level. If the account is missing, can't log in, or isn't `ACTIVE`/`L1`, stop and tell the user. Don't register a replacement without their go-ahead, and if they agree, update `test-accounts.json`.
- If a rule needs a different operator (for example `L2`/`L3`, or a second operator), ask the user. Add it to `test-accounts.json` under its own `key`, with its password in its own OS variable.

### Data the API can't create

The shared operator is `L1`, and the API has no way to raise it. Zones are seeded reference data with no create endpoint. If keeping the other gates passing needs an `L2`/`L3` operator, or a zone value that doesn't exist, say so in the plan and ask the user which seeded account or zone to use. Don't invent one.

## 3. Confirm with the user before writing

Show the plan and wait for confirmation. Sort it by priority (1 first, 4 last) and write files in that order. Put every question in the same message, so there is **one** round. For each planned test case show:

- the ID (see section 4)
- the summary
- the technique, and the value or transition it covers
- the requests, in order (method and path)
- the expected status codes
- the proposed priority, with a one-line reason
- the source (page and section)

Ask in the same round about:
- **Values the rule depends on** that the source doesn't give.
- **Open questions:** a rule that depends on an item still open in `05 - Open Questions` (for example the `BR-ZONE-ACTIVE` citation, or `Operator.status = SUSPENDED`). Mark those expected results **TBC** or leave the case out, as the user chooses.
- **Seeded data** the case needs (see "Data the API can't create").

The user may add, remove or change cases and priorities. Only write files after they confirm.

## 4. IDs, file names and folder

All API test cases live in **`test-cases/api/`**, one folder for every area, with the prefix **`API-OP-`**.

- **ID:** `API-OP-` plus a three-digit number. Take the highest number already used in `test-cases/api/` or listed in `test-cases/retired-ids.txt`, and add one. Never reuse a number. `API-OP-000` is reserved for this skill's example. Within a batch, number in the order of the priority-sorted list.
- **File name:** `<ID>-<short-name>.md`, for example `API-OP-004-validate-with-duration-241-minutes-fails-time-window.md`.
- Create `test-cases/api/` if it doesn't exist.

## 5. Write each test case

Every time this skill runs, read `templates/api-test-case-template.md` and build each file from it. It has the same fields as the UI template; only the step column holds HTTP requests. Keep its sections, field order and table layout exactly, and leave no `<placeholder>` behind. If the format must change, change the template.

Also read `examples/API-OP-000-validate-with-duration-14-minutes-fails-time-window.md`. Its ID is reserved, so it isn't a real test case. Match its level of detail, not its content.

### Field rules

- **Dates:** `dd/mm/yyyy`. For a new test case, both dates are today.
- **Assigned To:** always empty.
- **Business Rule:** the rule's ID from `find_gaps.mjs`, for example `BR-TIME-DURATION`. `cover-gaps` uses this field to tell which rules are covered, and it scans `test-cases/api/` too.
- **Preconditions:** everything that must exist before step 1, with the API call that creates it and the concrete body values, for example "Aircraft created with `POST /aircraft`: … `mtom_grams` `12001`". Name the IDs later steps use as variables in braces (`{flightRequestId}`, `{pilotId}`). Give times relative to now ("`window_start` now + 5 h 59 min"), never fixed dates, so the case can run on any day. Precondition 2 is always the login of the shared operator, and preconditions 3 and 4 are the run's pilot and aircraft (see "Test accounts: the shared operator"). Copy their wording from the example. Use `{stamp}` in pilot national IDs and aircraft serial numbers, so each run creates fresh ones. Never write a password or other secret: name it as a secret, for example "password from the secret `operatorPassword`".
- **Steps (Request column):** one HTTP request per row, in this shape:

  ```
  **POST** `/api/v1/flight-requests/{flightRequestId}/validate`<br>Auth: operator session of `op-api-001-{stamp}@test.example`<br>Body: none
  ```

  Always the method, the full path under `/api/v1`, exactly one `Auth:` line and a `Body:` line (`none`, or the exact JSON). Take the method and path from `03 - API Contract`.
- **Expected results:** start each with `•` and separate them with `<br>`.
  - The first is always the status code: `• Status \`422\``.
  - For `422`, add exactly these three: `failing_gate` is the gate from `06`/`07`; `rule_reference` is the value from `06` §6, verbatim; `message` is a non-empty string. Confluence doesn't fix the text of `message`, so don't assert its wording unless a source or a chat decision gives it.
  - For `200` from `validate`: `ok` is `true`.
  - For a `GET` in a chain: the `state`, plus `failing_gate` and `rule_reference` when the request was rejected by a gate.
  - For `409` and other errors: the status only. The body is "conflict detail" with no fixed shape.
  - Never an on-screen result, and never a `data-testid`.
- **Rule values:** follow `07 - Clarifications` over `06`. For example, the weight-band rule fails `AIRCRAFT`, not `ZONE`, and shares `ZC-2026.1 §2` with the altitude rule, so `failing_gate` tells them apart.
- **Postconditions:** the state the request is left in, and any cleanup. Data made from `{stamp}` needs none.
- **Priority:** 1 (highest) to 4:
  - **1:** if this failed, the system would allow something the rules forbid, block its core purpose, or expose another operator's data.
  - **2:** a main function would be wrong, with no reasonable workaround.
  - **3:** a secondary function or error handling would be wrong, or a workaround exists.
  - **4:** low impact.
- **TBC:** if the user decides to write a case before the correct result is known, start each affected result with `**TBC:**` and the possible outcomes, and add a "**To be confirmed:**" note under **Source** naming what is undecided and who decides. `postman-collection-builder` leaves TBC cases out, so list them in your report.
- **Source:** Markdown links to the Confluence pages with their sections, for example `[06 - Business Rules](https://yaroslavmyhalko236.atlassian.net/wiki/spaces/SD1/pages/688129) §1.4, §6`. Cite `public/openapi.yaml` by path when you used it.

## 6. Check each test case

Before saving, check that each case:
- covers one condition (one value, partition or transition). If not, split it and tell the user.
- for BVA/EP, has exactly one step, the `validate` call, and keeps every gate not under test passing.
- has exactly one identity per request, never a session and `X-Reviewer-Id` together.
- has a status code on every row, and the three `422` fields on every `422` row.
- uses only endpoints and codes from `03 - API Contract` and `02 - State Machine`, and a `rule_reference` copied verbatim from `06` §6.
- contains no `data-testid`, no UI step and no secret value.
- has a unique ID, a file name that starts with it, every template field in order and no `<placeholder>` left.

## 7. Updating existing test cases

- Only API test cases in `test-cases/api/`. For a UI case, use `ui-test-case-creator`.
- Keep the ID, Date Created and file name. Set Date Last Updated to today.
- If the summary changes so much that the file name no longer fits, ask before renaming.
- If the example in `examples/` is a copy of the case, update it too.

## 8. Report back

List the files created or changed, with IDs, summaries and technique. Group the state transition chains together and say they are ready for `postman-collection-builder`. Also list TBC cases, anything not covered because the source is silent, and any conflict found between Confluence and `openapi.yaml`.
