---
name: testomat-sync
description: Sync SkyPermit test cases and results with Testomat.io, so UI and API work lives in one place. It has three operations. upsert finds or creates suites and, for each test case, reuses the test named "<case-id>..." instead of creating a duplicate, tagging only new tests with the task key. run creates a run from those tests and returns run_id. report writes results, including failure messages, into a run and closes it. Use it whenever the UI or API orchestrator, or the user, wants to push, upload, publish or sync test cases to Testomat, create a Testomat run, or record results or failures in one, even if they don't name the skill. Don't use it to write or review test cases, execute tests, read Jira or Confluence, or delete anything in Testomat.
argument-hint: "upsert|run|report <JSON>"
allowed-tools: Read, mcp__testomatio__suites_list, mcp__testomatio__suites_create, mcp__testomatio__tests_list, mcp__testomatio__tests_create, mcp__testomatio__runs_list, mcp__testomatio__runs_create, mcp__testomatio__runs_get, mcp__testomatio__runs_update, mcp__testomatio__testruns_list, mcp__testomatio__testruns_update
---

# Testomat sync

This is the only way testware reaches Testomat.io. The UI and API orchestrators both call it, so they share the same suites, tests and runs. Project: `skypermit-f139b`, through the `testomatio` MCP server.

## The rules that matter most

- **Never create a duplicate.** One case ID means one test in Testomat. When it's unclear which suite or test is meant, report a `conflict` and leave the choice to the caller. A wrong guess splits a test's history across two records, and nobody notices until the results disagree.
- **Report only what happened.** Results come from the caller. Don't infer, fill in or change a status, and don't execute tests.
- **Never delete anything.** This skill has no delete tools. If cleanup is needed, tell the user.

Each operation returns one JSON object in a code block and nothing else, because orchestrators read it. If the `testomatio` server can't be reached or a call fails, stop and return `"error"` with what was already done, so a retry doesn't repeat it.

## upsert

Input:

```json
{
  "task_key": "SKY-5",
  "suite": "Flight request",
  "cases": [
    { "file": "test-cases/checks/TC-CHK-010-window-fully-inside-curfew-is-refused.md" },
    { "file": "test-cases/checks/TC-CHK-011-window-crossing-midnight-in-curfew-is-refused.md", "suite": "Other suite" }
  ]
}
```

`task_key` and a suite for every case are required, and a case's own `suite` overrides the top-level one. If any are missing, ask or return `"error"`. Don't work out a suite from the folder name, because `test-cases/checks/` tests can live in "Flight request". Write `task_key` in upper case.

### 1. Read the cases

Read each file. The first heading gives the case ID and title: `# TC-CHK-010: A window ...`. If two entries have the same case ID, process it once.

### 2. Find or create each suite

Call `suites_list` with `search_text` set to the suite name. The search is partial, so compare titles yourself, ignoring case and surrounding spaces. The result is a tree, so also look in any `children`.

| Exact matches | Action |
|---|---|
| none | `suites_create` with `title` and `file_type: "file"`. Only `file` suites hold tests. |
| one, `file_type` is `file` | use it |
| one, `file_type` is `folder` | `conflict` for its cases |
| more than one | `conflict` for its cases |

### 3. Find or create each test

Search the whole project, not just the suite, because a case may already have been filed elsewhere. Call `tests_list` with `tql: "test % '<case-id>'"`, `per_page: 100` and `fields: ["id", "title", "clean_title", "suite_id"]`, and read every page.

**Filter the matches yourself.** The search is partial: `TC-CHK-001` also returns `TC-CHK-0010`. A test matches only when its `clean_title` equals the case ID, or starts with it and the next character isn't a letter, digit or hyphen. Use `clean_title` because Testomat appends tags to `title` (`... @SKY-5`).

| Exact matches | Action | `action` value |
|---|---|---|
| none | create the test (see below) | `created` |
| one | take it as it is | `found` |
| more than one | use none of them | `conflict` |

Testomat can list deleted tests for a few seconds after a suite is removed. Before reporting a `conflict`, read the list once more.

A found test stays untouched: don't update its text, priority or tags, and don't move it. If it is in a different suite from the one requested, say so in `notes`.

To create a test, call `tests_create` with:

- `suite_id`, and `state: "manual"`
- `title`: the file's heading without the `# `
- `priority`: from the file's Priority section: 1 `critical`, 2 `high`, 3 `normal`, 4 `low`
- `link`: `[{"action": "add", "type": "tag", "value": "<task_key>"}]`
- `description`: see below

### Description format

Keep the wording exactly as in the file, so Testomat and the repo don't drift apart. Start with these lines from the header table, then the file's sections in order:

```markdown
**Summary:** ...

**Business Rule:** ...

**Jira:** <task_key>

## Preconditions
...
```

Copy every section, including any closing "To be confirmed" note. The only change is the "Steps and Expected Results" table, which becomes a `## Steps` list, with each `<br>` line as its own bullet:

```markdown
1. Open `{BASE_URL}/operator/requests/new`.
   **Expected:**
   - The form `flight-request-create-form` is shown.
```

If a file has no such table, copy its steps section unchanged. If a file has no Summary or Business Rule, leave that line out.

### Output

```json
{
  "operation": "upsert",
  "task_key": "SKY-5",
  "suites": [{ "title": "Flight request", "suite_id": "8cc6d756", "action": "found" }],
  "tests": [
    { "case_id": "TC-CHK-010", "test_id": "b1209f7e", "suite_id": "8cc6d756", "action": "found", "tbc": false },
    { "case_id": "TC-CHK-015", "test_id": "df51d109", "suite_id": "8cc6d756", "action": "created", "tbc": true }
  ],
  "conflicts": [],
  "notes": null
}
```

`tbc` is `true` when the file marks an expected result as **TBC** or "To be confirmed", so the caller can decide whether a pass or fail would mean anything. Each `conflicts` entry has the `case_id` or suite, what was found (with IDs) and why it wasn't used.

## run

Input:

```json
{
  "task_key": "SKY-5",
  "check_type": "ui",
  "test_ids": ["b1209f7e", "d407614f"],
  "kind": "manual"
}
```

`task_key`, `check_type` (`ui` or `api`) and a non-empty `test_ids` are required. `kind` is optional and defaults to `manual`. The caller decides which tests go in, so don't drop any, including `tbc` ones.

1. The title is `<task_key> · UI` or `<task_key> · API`.
2. Call `runs_list` with `tql: "title == '<title>' and unfinished"`. Finding one doesn't stop you, because each execution gets its own run, but list its ID in `notes`. If that query fails, simplify it to `title % '<title>'`.
3. Call `runs_create` with `title`, `kind` and `test_ids`. Testomat starts the run immediately, with every test `pending`.
4. Compare `tests_count` in the response with the number of `test_ids`, and explain any difference in `notes`.

```json
{
  "operation": "run",
  "run_id": "19a56a4e",
  "title": "SKY-5 · UI",
  "url": "https://app.testomat.io/projects/skypermit-f139b/runs/19a56a4e",
  "tests_count": 10,
  "notes": null
}
```

## report

Input:

```json
{
  "run_id": "19a56a4e",
  "results": [
    { "test_id": "b1209f7e", "status": "failed", "message": "Step 9: expected status 422, got 200", "run_time_ms": 1500 },
    { "test_id": "d407614f", "status": "passed" },
    { "test_id": "df51d109", "status": "skipped", "message": "Expected result to be confirmed by the rules owner" }
  ]
}
```

`status` is `passed`, `failed` or `skipped`. `message` is required for `failed`, and `run_time_ms` is optional.

### 1. Check everything before writing

A half-written run is hard to tell from a finished one, so check the whole input first and write nothing if any check fails:

- `runs_get`: the run exists and its status is `running`. Don't reopen or change a finished run.
- `testruns_list` with `run_id`, `per_page: 100` and `fields: ["id", "test_id", "status"]`, reading every page: every `test_id` in `results` is in the run. Testomat already holds a pending row for each test, and that row's `id` is the `testrun_id`.
- Every `status` is valid, and every `failed` result has a non-empty `message`.

### 2. Write the results

For each result, call `testruns_update` with `testrun_id`, `run_id`, `status`, and `message` and `run_time` (milliseconds) when given. Update the existing rows: creating new ones would count tests twice.

### 3. Close the run

Close only when every test in the run has a result. Call `runs_update` with `status_event: "finish"`. The run's final status comes from its results, so a single failure makes it `failed`.

If any tests would stay `pending`, leave the run open and list them in `pending`. Closing would present an unfinished execution as complete, and the caller can send the rest later: results already written can be left out of that call.

```json
{
  "operation": "report",
  "run_id": "19a56a4e",
  "closed": true,
  "status": "failed",
  "passed": 8,
  "failed": 1,
  "skipped": 1,
  "pending": [],
  "url": "https://app.testomat.io/projects/skypermit-f139b/runs/19a56a4e",
  "notes": null
}
```

Take the counts and `status` from the `runs_update` response, not from the input, so they show what Testomat actually recorded.

## When not to use this skill

| The user wants to… | Use instead |
|---|---|
| write or update UI/E2E test cases | `ui-test-case-creator` |
| review a test case against the docs and the code | `test-case-reviewer` subagent |
| read a Jira ticket | `jira-intake` |
| delete or clean up suites, tests or runs in Testomat | not this skill: do it as a separate, explicit request |
