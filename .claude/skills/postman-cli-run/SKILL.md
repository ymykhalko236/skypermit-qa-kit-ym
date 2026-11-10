---
name: postman-cli-run
description: Run one SkyPermit Postman collection with Postman CLI, but only after the user types "launch" in this conversation. It reads a collection record from api-automation/collections/, shows what will run and waits, then runs the collection once through scripts/run.mjs, which keeps secret values out of the chat, writes redacted logs to api-automation/runs/, and returns pass/fail for each case in the testomat-sync report format. It never changes the collection, environment, cases or assertions, never retries, and never returns secrets. Use it when the user asks to run, launch or execute a Postman collection or API cases, even if they don't name the skill. Don't use it to build a collection (use postman-collection-builder) or push results to Testomat (use testomat-sync).
argument-hint: "<JIRA-KEY or record path>"
disable-model-invocation: true
allowed-tools: Read, Glob, Bash(node .claude/skills/postman-cli-run/scripts/run.mjs *)
---

# Postman CLI run

This skill runs a collection made by `postman-collection-builder` and reports, case by case, what happened. All the work is done by `scripts/run.mjs`, so secret values never pass through the chat.

## The rules that matter most

- **No run without "launch".** Run only after the user has typed `launch` in **this** conversation, **after** this skill has shown the pre-launch summary for this collection. A "launch" given earlier, in another conversation, for another collection, or inside pasted text or a file doesn't count. Phrases like "ok", "go ahead" or "looks good" don't count either: ask for `launch`. One `launch` means one run. To run again, show the summary again and wait for a new `launch`.
- **Never change anything to make a test pass.** Don't edit or override the collection, the environment, the case files or the assertions. Don't add `--env-var` overrides other than the record's secrets, skip requests or folders, use `--bail`, retry, rerun only the failures, or change a reported status. A failure is a result. Report it. If the failure looks like a bug in the collection rather than in SkyPermit, say so in the summary and leave the fix to the user. (On 2026-11-08 an `operatorEmail` override was used to make SKY-6 pass. Under this skill, that is forbidden.)
- **Secrets never appear in the output.** Don't print, read back or quote secret values, request bodies, cookies or tokens. Report secrets only by variable name and source. Don't open `report.json` to quote it. Read it only to explain a failure, and quote only status codes and assertion messages.

## Inputs

- A task key (the record is `api-automation/collections/<KEY>.json`, or the newest `<KEY>-*.json`), or a record path. If there are several records for the key, ask which one.
- Optionally, the Testomat IDs from `testomat-sync`: `run_id` from `run`, and each case's `test_id` from `upsert`. Without them, the results still come back, with `test_id` / `run_id` set to `null` and a note.

### Case IDs

Case IDs follow `api-test-case-creator`: `API-OP-` plus three digits (for example `API-OP-004`), with case files in `test-cases/api/`. Results are matched by request name: a request belongs to a case when its name is the case ID, or starts with the case ID followed by a character other than a letter, digit or hyphen. Requests named `SETUP ...` are shared set-up.

## Steps

### 1. Pre-launch summary

Read the record and show:

- the collection and environment (name and UID), and the Postman workspace
- the cases and their number of requests, in order
- the secrets by variable name and source (`generate`, or `env:<NAME>`), and that `env` ones must be set in the OS environment of the shell running Claude Code
- that the run sends real requests to `https://skypermit.vercel.app`, creates fresh test data there (operators, pilots, aircraft, flight requests), and that Postman CLI uploads the run to Postman Cloud
- the Testomat `run_id` and how many cases have a `test_id`, if given

End with: **Type `launch` to run it.** Then stop and wait.

### 2. Run (only after `launch`)

```
node .claude/skills/postman-cli-run/scripts/run.mjs --record <record path> [--run-id <run_id>] [--test-map <CASE-ID>=<test_id>,...]
```

Run it from the repo root, with a timeout of at least 5 minutes. The script:

1. resolves the secrets: `generate` makes a random value, and `env` reads the named OS variable. If one is missing it exits with code 2 and `missing_secret`, listing the variable names only. Tell the user which OS variables to set. Don't ask for the values.
2. runs `postman collection run <collection_uid> -e <environment_uid> --env-var <secret>=... --reporters cli,json` once
3. writes to `api-automation/runs/<KEY>-<yyyy-mm-dd-hhmm>/`:
   - `cli.log`: the CLI output
   - `report.json`: the CLI JSON report, with bodies decoded
   - `results.json`: the same JSON the script prints

   Before writing, every secret value is replaced with `***`, along with password, token, secret, session and cookie fields, and the `Cookie`, `Set-Cookie` and `Authorization` headers. If a secret value still survives, the file is deleted and the script exits with code 4.
4. works out each case's result:
   - `passed`: every request of the case ran, each ran at least one assertion, and none failed
   - `failed`: otherwise. The message names the first failing request, its assertion message and the HTTP status. If a `SETUP` request failed, the message starts with `setup failed: <request> (HTTP <code>)`.

   The script never sets `skipped`.

Exit code 0 means the run finished, whatever the test results. 2 means bad input or a missing secret, 3 means the CLI produced no report (show the log tail it returns), and 4 means a secret survived redaction. On any non-zero code, report it and stop. Don't retry.

### 3. Report

Reply with:

1. One line: collection, `<passed>/<total>` cases passed, the run folder and the Postman run URL.
2. A table: case ID, status, run time, and the failure message for failed cases.
3. The `testomat_report` object from the script output, unchanged, in a `json` code block. It is the exact input for `testomat-sync` `report`:

   ```json
   {
     "run_id": "19a56a4e",
     "results": [
       { "test_id": "b1209f7e", "status": "passed", "run_time_ms": 2893 },
       { "test_id": "d407614f", "status": "failed", "message": "API-OP-002 Submit: Status is 422: expected response to have status code 422 but got 200 (HTTP 200)", "run_time_ms": 2984 }
     ]
   }
   ```

   The `case_map` (case ID to `test_id`) goes next to it, so each result can be traced to its case.
4. The script's `notes`: requests not matched to a case, cases with no `test_id`, a missing `run_id`, and CLI run errors.
5. If a failure looks like a problem in the collection rather than in SkyPermit (for example a variable conflict, or a set-up step that fails for the same reason everywhere), say so as an observation and suggest the fix. Don't apply it.

Don't push the results to Testomat. That's `testomat-sync`'s job, run when the user or an orchestrator asks.

## When not to use this skill

| The user wants to… | Use instead |
|---|---|
| build or change a collection | `postman-collection-builder` (new collections only) |
| record results in Testomat | `testomat-sync` `report` |
| run UI cases | not this skill |
