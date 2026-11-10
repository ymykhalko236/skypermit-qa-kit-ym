# <ID>: <Summary>

| Field | Value |
|---|---|
| ID | <ID> |
| Summary | <one sentence: the condition and its expected outcome> |
| Business Rule | <business rule ID covered, for example BR-TIME-DURATION> |
| Date Created | <dd/mm/yyyy> |
| Date Last Updated | <dd/mm/yyyy> |
| Assigned To | |

## Preconditions
1. <Data that must exist before step 1, with the API call that creates it and its concrete body values>

## Steps and Expected Results
| # | Request | Expected Result |
|---|---|---|
| 1 | **<METHOD>** `/api/v1/<path>`<br>Auth: <operator session of `<email>` / `X-Reviewer-Id: <value>`><br>Body: <`{ JSON }` or none> | • Status `<code>`<br>• <`field` is `value`: one or more per step, as many as the source supports> |
| <n> | <One request per row, as many as the chain needs> | • Status `<code>`<br>• <`field` is `value`> |

## Postconditions
- <State of the system after the test, or cleanup needed so the test can be run again>

## Priority
<1–4> — <short reason>

## Source
<[Confluence page title](page URL) and section, repo file path, or "Chat decision, dd/mm/yyyy: <what was decided>">
