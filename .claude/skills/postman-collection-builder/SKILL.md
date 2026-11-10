---
name: postman-collection-builder
description: Build a new Postman collection and environment for SkyPermit API test cases through the postman MCP server. Given a Jira task key and API case files, it reads the cases and ../ct-gen-ai-skypermit/public/openapi.yaml, creates one request per case step named "<case-id> ...", adds assertions on the status code and the response body to every request, keeps secrets only as empty secret environment variables, saves a collection record to api-automation/collections/, and stops with the list of requests and assertions for review. It never runs anything and never modifies or deletes an existing collection or environment. Use it when the user asks to build, create, generate or prepare a Postman collection from API test cases, even if they don't name the skill. Don't use it to run a collection (use postman-cli-run), write API test cases, or push anything to Testomat (use testomat-sync).
argument-hint: "<JIRA-KEY> <case files or folder>"
allowed-tools: Read, Glob, Grep, Write(api-automation/collections/**), mcp__postman__getWorkspaces, mcp__postman__getCollections, mcp__postman__getCollection, mcp__postman__getEnvironments, mcp__postman__getEnvironment, mcp__postman__createCollection, mcp__postman__createEnvironment
---

# Postman collection builder

This skill turns reviewed API test cases into a **new** Postman collection and environment in the SkyPermit Postman workspace, then stops so the user can review it. Running the collection is a separate step (`postman-cli-run`), started only by the user.

## The rules that matter most

- **Create only.** Never update, overwrite, fork or delete an existing collection or environment, even one this skill made earlier. The allowed tools contain no `put*`, `patch*` or `delete*` call, so don't look for a way round that. If an existing item looks wrong, tell the user.
- **Nothing is launched.** No Postman CLI, no Newman, no monitors, no requests sent to SkyPermit. The skill ends with the review list.
- **Every case request is named `<case-id> ...`** so `postman-cli-run` can match results back to cases and to their Testomat tests.
- **Secrets live only in the environment**, as variables of type `secret` with an empty value. A secret never appears in the collection, its variables, its scripts, a request body, a header, the record file or the chat.
- **Don't invent expected results.** Assertions come from the case file. If a case doesn't say what to expect, or marks it **TBC** / "To be confirmed", leave the case out and list it, rather than guessing.

## Inputs

- `task_key`: a Jira key such as `SKY-6`. Write it in upper case.
- Case files: paths, or a folder to search with Glob.

If either is missing, ask.

### Case files (provisional)

> **TODO:** the API case format and ID naming will be defined by the API test case creator skill, which doesn't exist yet. When it does, replace this section with its format and ID pattern, and update the matching section in `postman-cli-run`.

Until then:

- The case ID and title come from the first heading: `# <case-id>: <title>`. If a file has no such heading, or two files share an ID, stop and list them.
- For every request it makes, a case must state the method, the path, the request body (if any), the **expected status code** and the **expected response body** (fields and values, or at least which fields must be present). If any of these is missing, the case is left out (see "Stop conditions").
- Set-up a case relies on (an operator, pilot, aircraft and so on) can be stated in its preconditions.

## Sources

1. **Case files**: the expected results. They have already been reviewed against Confluence, so they win over everything else for what to assert.
2. **`../ct-gen-ai-skypermit/public/openapi.yaml`** (read-only): paths, request schemas, required fields, auth (session cookie from `POST /operators` or sign-in) and response shapes. Use it to build valid requests and set-up steps, not to add assertions the case doesn't ask for.
3. If a case and `openapi.yaml` disagree (path, method, field name, status code), **stop and report the conflict**. Don't pick one. Per `CLAUDE.md`, Confluence is the source of truth, and the user decides whether the case or the code is wrong.

## Steps

### 1. Read and check everything first

Read every case file and `openapi.yaml`. For each case, note its requests, expected statuses and expected body fields. Collect any problems (missing expectations, TBC, conflicts with `openapi.yaml`, duplicate IDs) before creating anything.

### 2. Find the workspace and check names

- `getWorkspaces`: use the workspace named exactly `SkyPermit` (currently `f0f617bc-85b2-4d5a-9a4b-aff7c0a505ad`). If there is none, or more than one, stop and ask.
- `getCollections` with that workspace: the new collection's name is `<KEY> API · <first case ID>–<last case ID>`. If that name is already taken, add ` · <yyyy-mm-dd hh:mm>`. Never reuse or replace the existing one.
- `getEnvironments`, then `getEnvironment` for each candidate: reuse an existing environment **only** if its variable keys are exactly the ones this collection needs (see step 4) and its non-secret values are correct. Otherwise create a new one named `SkyPermit · <KEY> API` (add the date and time if that name is taken). Never edit an existing environment to make it fit.

### 3. Design the collection

Folder layout:

```
00 Setup                    SETUP Register operator, SETUP Create pilot, ...
<case-id> <case title>      <case-id> Create request, <case-id> Submit, ...
<case-id> <case title>      ...
```

- **Request names.** Every request in a case folder starts with the case ID followed by a space: `TC-XXX-001 Submit`. Shared set-up requests start with `SETUP `. No other names are allowed, because the run skill reports any request it can't match.
- **Order.** Cases in ID order. Within a case, in the order of its steps. A case may create its own set-up when its preconditions differ from the shared set-up.
- **Test data.** Make every run independent: unique emails, national IDs and serial numbers from `Date.now()` in a pre-request script, and times relative to now (for example `window_start` 5 h 59 min ahead) computed in the pre-request script, exactly as the case states them.
- **Variables.** Values set at run time (IDs, stamps, computed times) are **collection variables**, set with `pm.collectionVariables.set`. Never use `pm.environment.set` or `pm.globals.set`.
- **No shadowing.** No environment variable may share a name with a collection variable. Environment variables take priority, so an empty one would override the value the script sets. That is exactly what broke the SKY-6 run on 2026-11-08 (`operatorEmail`).
- **Auth.** Use what `openapi.yaml` describes. With session cookies, rely on the Postman cookie jar and don't copy cookie values into variables.

### 4. Assertions

Every request, including `SETUP` ones, gets a test script.

- **Status first:** `pm.test('Status is <code>', () => pm.response.to.have.status(<code>));`
- **Body next**, one `pm.test` per expected field, named after what it checks: `failing_gate is TIME_WINDOW`, `rule_reference is TSD-4 §2.1`. Use `eql` for exact values, `to.be.a('<type>')` / `to.match(...)` only when the case gives a type or pattern instead of a value. Assert only fields the case states.
- **Set-up requests** assert their status and the fields the cases rely on (for example `authorisation_level` is `L1`), then save the IDs they need.
- Parse the body defensively, so a non-JSON response fails the assertion instead of breaking the script: `let body = {}; try { body = pm.response.json(); } catch (e) {}`.
- No `pm.test` may pass unconditionally, and no assertion may be skipped or softened (`pm.expect.fail` only for real checks).

### 5. Secrets

The environment holds only `baseUrl` (`https://skypermit.vercel.app/api/v1`, type `default`) and the secrets the collection needs, each with type `secret`, an empty `value` and a description.

Record where each secret's value will come from at run time:

- `generate`: a throwaway credential for an account the run itself creates (for example the password of an operator registered in `SETUP`). The run skill makes a random value.
- `env`: a credential for something that already exists (for example a seeded reviewer). The run skill reads it from the OS environment variable `SKYPERMIT_<UPPER_SNAKE_NAME>`, for example `reviewerPassword` → `SKYPERMIT_REVIEWER_PASSWORD`. Never ask the user to paste the value.

### 6. Create

1. `createEnvironment` (only if not reusing one), with the workspace ID.
2. `createCollection` with the workspace ID, `info.schema` `https://schema.getpostman.com/json/collection/v2.1.0/collection.json`, and an `info.description` that gives the task key, the case files, the environment to select and "Run with the postman-cli-run skill."
3. `getCollection` with `model: "full"` and compare it with the design: every planned request is there, with its name, method, URL and number of `pm.test` calls. Report any difference. Don't fix it by editing, because this skill can't modify a collection. Tell the user instead.

### 7. Save the record

Write `api-automation/collections/<KEY>.json`. If it exists, write `<KEY>-<yyyy-mm-dd-hhmm>.json` instead, so earlier records stay. `postman-cli-run` reads this file.

```json
{
  "task_key": "SKY-6",
  "created_at": "2026-11-08T12:00:00Z",
  "workspace_id": "f0f617bc-85b2-4d5a-9a4b-aff7c0a505ad",
  "collection_uid": "2892909-...",
  "collection_name": "SKY-6 API · TC-XXX-001–TC-XXX-004",
  "environment_uid": "2892909-...",
  "environment_name": "SkyPermit · SKY-6 API",
  "environment_reused": false,
  "secrets": [
    { "variable": "operatorPassword", "source": "generate" },
    { "variable": "reviewerPassword", "source": "env", "env": "SKYPERMIT_REVIEWER_PASSWORD" }
  ],
  "setup": ["SETUP Register operator", "SETUP Create pilot"],
  "cases": [
    {
      "case_id": "TC-XXX-001",
      "file": "test-cases/.../TC-XXX-001-....md",
      "requests": ["TC-XXX-001 Create request", "TC-XXX-001 Submit"],
      "assertions": {
        "TC-XXX-001 Create request": ["Status is 201", "state is DRAFT"],
        "TC-XXX-001 Submit": ["Status is 422", "failing_gate is TIME_WINDOW"]
      }
    }
  ],
  "excluded": [{ "case_id": "TC-XXX-005", "reason": "expected body is TBC" }]
}
```

### 8. Stop for review

Reply with:

1. The collection and environment (name, UID, created or reused), and the record path.
2. A table with one row per request: `#`, request name, method and path, and its assertions.
3. The secrets, by variable name and source only (`generate`, or `env:<NAME>`), and which OS variables the user must set before launching.
4. Excluded cases and conflicts, with reasons.
5. One closing line: nothing has been launched; when the user is happy with it, they can run it with `postman-cli-run`.

## Stop conditions

Stop and report, creating nothing, when:

- the `postman` MCP server can't be reached or a call fails (report what was already created, so a retry doesn't make a duplicate)
- the SkyPermit workspace is missing or ambiguous
- a case conflicts with `openapi.yaml`, or no cases are left after exclusions

A single case with missing or TBC expectations doesn't stop the build: leave it out and list it.

## When not to use this skill

| The user wants to… | Use instead |
|---|---|
| run a collection | `postman-cli-run` |
| change, fix or delete an existing collection or environment | not this skill: do it as a separate, explicit request |
| write API or UI test cases | the API test case skill / `ui-test-case-creator` |
| push cases or results to Testomat | `testomat-sync` |
