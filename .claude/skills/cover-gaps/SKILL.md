---
name: cover-gaps
description: Find SkyPermit business rules that have no test case yet and cover them. It lists the gaps with a script, writes low-level test cases for each uncovered rule with the low-level-test-cases skill, has every new test case checked by the test-case-reviewer subagent, removes test cases that are not compliant, logs those it cannot determine as open questions, and returns a JSON summary. Arguments, both optional and in any order are the maximum number of rules to cover, and a gate (PILOT, AIRCRAFT, ZONE, TIME_WINDOW). Use it whenever the user asks to cover gaps, find uncovered or untested business rules, check business-rule coverage, or fill missing test cases for a gate, even if they don't name the skill.
argument-hint: "[max] [PILOT|AIRCRAFT|ZONE|TIME_WINDOW]"
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Write(test-cases/**)
---

# Cover gaps

This skill closes the gap between the SkyPermit business rules and the test cases in `test-cases/`. It runs unattended from start to finish. The reviewer subagent replaces the usual human confirmation, so the user doesn't have to answer anything until the summary.

## Arguments

Both arguments are optional and can come in any order:
- **max:** a positive integer. The maximum number of uncovered rules to work on in this run. Default `3`, so that one run stays small enough to review.
- **gate:** `PILOT`, `AIRCRAFT`, `ZONE` or `TIME_WINDOW` (any case). Without a gate, every rule is in scope, including the two that aren't gates: the aircraft registration weight ceiling and the cancellation deadline.

If an argument is neither a number nor a gate name, stop and say which values are allowed. Don't guess what was meant.

## Step 1: List the gaps

Run the script from the repo root:

```
node .claude/skills/cover-gaps/scripts/find_gaps.mjs --max <max> [--gate <gate>]
```

It reads the rule table in `../ct-gen-ai-skypermit/docs/06-business-rules.md` §6 and the cancellation deadline in §5. It then applies the corrections from `07-clarifications.md`: the weight-band rule belongs to `AIRCRAFT`, and the zone-inactive citation is still unconfirmed. Each rule gets a stable ID such as `BR-ZONE-ALTITUDE`. A rule counts as covered when some test case lists its ID in the **Business Rule** row of its header table. The script prints JSON with `totals`, `covered`, `gaps` (at most `max`, in gate evaluation order) and `gaps_not_returned`.

Keep this first output, because the summary reports coverage before and after the run. If `gaps` is empty, skip to step 5 and report that there was nothing to cover.

If a gap has `"unmapped": true`, the docs contain a rule the script doesn't know. Cover it like the others, and mention it in the summary so the user can add its ID to the script's `ID_MAP`.

## Step 2: Write test cases for each gap

Take the gaps one at a time, in the order the script returned them. For each gap, invoke the `low-level-test-cases` skill and pass it the rule: its ID, gate, condition, `rule_reference`, `source`, `area`, and any `note` or `open_question`. Follow that skill completely, with these changes, because this run has no human in the loop:

- **No confirmation round (its section 3).** Plan the atomic test cases, sort them by priority, and write them straight away. Cover the rule with as many atomic test cases as its conditions need, for example a value at a boundary, just past it, and just inside it. Don't write variations that test the same thing twice. They make the review cost more and the coverage doesn't improve.
- **No questions.** Where the skill would ask, decide as follows:
  - Interface: use the API. The gates show up in the `422` response (`failing_gate`, `rule_reference`), so the API is the precise place to observe them.
  - Values or behaviour the sources don't settle, and anything that depends on an item still open in `05-open-questions.md` (the gap's `open_question` field flags these): write the result as **TBC** in the way the skill describes. Never invent an expected result. The reviewer will then give the test case CANNOT DETERMINE, and it goes into open questions, which is where it belongs.
- **Business Rule row:** set it to the gap's rule ID, so the next run sees the rule as covered.
- **Area:** use the gap's `area` unless the test case clearly belongs somewhere else.

Keep a list of every file you created and the rule each one covers. You need it for steps 3 and 4.

## Step 3: Review every new test case

For each new test case, launch the `test-case-reviewer` subagent with its file path. Launch all of them in one message, so they run in parallel. Give the reviewer only the path. It must judge the file on its own merits and has its own instructions. Wait until every reviewer has finished.

Before you use a report, check its **Source check** section. If any cited source is marked as not opened or not verified, or the section doesn't list every source the test case cites, the review is incomplete. Launch the reviewer once more for that test case and use the second report. If the second report is incomplete too, keep the test case, treat the verdict as `CANNOT DETERMINE`, and say in the open question which source went unchecked. A verdict from a review that skipped a source isn't safe to keep or delete on.

From each report, take the **Verdict** line. Also take a one-to-two sentence reason from the report's Issues or TBC items, with the evidence it cites.

## Step 4: Act on the verdicts

| Verdict | Action |
|---|---|
| `COMPLIANT` | Keep the file. |
| `COMPLIANT WITH MINOR ISSUES` | Keep the file. Put the reviewer's list of slips and fixes in the summary's `reason`, so the user can fix them with `low-level-test-cases`. Don't fix them here. |
| `COMPLIANT WITH DOCS, CODE DIFFERS` | Keep the file. The test case is correct and would expose a likely product defect, so flag it in the summary. |
| `NOT COMPLIANT` | Delete the file from `test-cases/`. Append its ID to `test-cases/retired-ids.txt` (create the file if needed), so the number is never reused. |
| `CANNOT DETERMINE` | Keep the file, and add an entry to `open-questions.md` at the repo root (format below). |

Don't fix a NOT COMPLIANT test case and keep it. The user asked for removal, and fixing it here would skip the review that the fix itself needs. Record the reviewer's reason in the summary, so the next run or the user can write a better one.

### `open-questions.md`

Create the file if needed with the heading `# Open questions` and one table:

```markdown
| Date | Test case | Business rule | Question | Reviewer's reason | Status |
|---|---|---|---|---|---|
| 25/10/2026 | [TC-CHK-004](test-cases/checks/TC-CHK-004-....md) | BR-ZONE-ACTIVE | <what must be decided, and by whom> | <reason + evidence> | Open |
```

Write the question so that someone who hasn't read the review can answer it, for example "Which `rule_reference` should a `422` for an inactive zone carry? Rules owner to confirm (05 row 5)". If an open row already exists for the same test case, update that row instead of adding a second one. Never write to the SkyPermit repo's `05-open-questions.md`: that repo is read-only.

## Step 5: Return the JSON summary

Run the script again with the same `--gate` and no `--max`, to get the coverage after the run. Then build the summary below. Save it to `reports/cover-gaps-<yyyy-mm-dd>-<hhmm>.json`, and print it in the chat in a `json` code block. After the JSON, add at most three lines that tell the user what needs their attention, such as open questions, likely product defects, and rules that are still uncovered.

```json
{
  "run_at": "2026-10-25T14:05:00Z",
  "arguments": { "max": 3, "gate": "ZONE" },
  "coverage_before": { "rules_in_scope": 3, "covered": 0, "gaps": 3 },
  "coverage_after": { "rules_in_scope": 3, "covered": 2, "gaps": 1 },
  "rules": [
    {
      "rule_id": "BR-ZONE-ALTITUDE",
      "condition": "Altitude exceeds ceiling",
      "rule_reference": "ZC-2026.1 §2",
      "covered_after_run": true,
      "test_cases": [
        {
          "id": "TC-CHK-001",
          "file": "test-cases/checks/TC-CHK-001-altitude-above-zone-ceiling-is-refused.md",
          "verdict": "COMPLIANT",
          "action": "kept",
          "reason": null
        },
        {
          "id": "TC-CHK-002",
          "file": "test-cases/checks/TC-CHK-002-altitude-at-zone-ceiling-is-accepted.md",
          "verdict": "NOT COMPLIANT",
          "action": "removed",
          "reason": "Uses 100 m ceiling for ODS-CTR-5; docs say 90 m (06-business-rules.md:§4)"
        }
      ]
    }
  ],
  "totals": { "test_cases_created": 2, "kept": 1, "removed": 1, "open_questions": 0, "likely_product_defects": 0 },
  "gaps_not_attempted": ["BR-ZONE-ACTIVE"],
  "unmapped_rules": []
}
```

Field meanings:
- `action` is one of `kept`, `kept_minor_issues` (verdict COMPLIANT WITH MINOR ISSUES), `kept_product_defect` (verdict COMPLIANT WITH DOCS, CODE DIFFERS), `removed` or `open_question`.
- `totals` also counts `minor_issues`, the number of test cases kept with `kept_minor_issues`.
- `covered_after_run` is true when at least one of the rule's test cases still exists. A test case logged as an open question counts, because the file is still there with its Business Rule ID.
- `gaps_not_attempted` lists the gaps in scope that were left over because of `max`.
- If a rule produced no test cases at all, for example because nothing about it could be written without inventing results, list it with `"test_cases": []` and add a `"note"` saying why.
