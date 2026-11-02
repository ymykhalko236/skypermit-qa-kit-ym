---
name: story-doc-check
description: Check a Jira story or task against the SkyPermit documentation. Given a Jira issue key (for example SKY-5), it reads the issue's acceptance criteria and, for each one, finds where the SkyPermit Docs Confluence space describes it. Each criterion gets one status, "covered", "contradicts" or "not described", with the page, section and a short quote as evidence. It returns a table and a short summary. Use it whenever the user gives a Jira key and asks whether its acceptance criteria are documented, traceable to the requirements, consistent with Confluence, or contradict the docs, even if they don't name the skill. Don't use it to write or review test cases, find business rules without test cases, compare the SkyPermit code with the docs, or edit a Jira issue or Confluence page.
argument-hint: "<JIRA-KEY>"
allowed-tools: mcp__atlassian__getJiraIssue, mcp__atlassian__getConfluencePage, mcp__atlassian__getPagesInConfluenceSpace, mcp__atlassian__getConfluencePageDescendants, mcp__atlassian__searchConfluenceUsingCql
---

# Story doc check

This skill checks one Jira issue's acceptance criteria against the SkyPermit documentation and reports, for each criterion, whether the docs support it. QA can then raise the gaps before writing test cases.

## The one rule that matters most

**The only source of evidence is the SkyPermit Docs Confluence space.** The value of this check is that it shows what the documentation says, not what seems reasonable. If you fill a gap with general knowledge, domain common sense, the SkyPermit code, `openapi.yaml`, the local `docs/` folder or the ticket's own wording, the gap disappears from the report. Someone may then write a test case with no requirement behind it. When the docs are silent, report "not described". That is a useful result, not a failure.

The check is read-only. You read Jira and Confluence. You never create, edit, comment on or transition anything in either of them, and you don't write files.

## Input

One argument: a Jira issue key such as `SKY-5`. The project key is in capital letters, followed by a hyphen and a number.

- If no key is given, or the argument doesn't look like a key, ask for one. Don't guess.
- Site: `yaroslavmyhalko236.atlassian.net`. Cloud ID: `34bbf7e9-2a64-4a58-bf3d-d5fed950d0c5`.

## Steps

### 1. Read the issue

Call `getJiraIssue` with `responseContentFormat: "markdown"`. Find the acceptance criteria in the description. The section is usually headed "Acceptance criteria", but it may have another heading, such as «Критерії приймання», or be written in another language. Number the criteria as the ticket numbers them. If they aren't numbered, number them in the order they appear.

- If the issue can't be read (not found, no access, the Atlassian server isn't connected), stop and tell the user. Don't continue from memory.
- If there is no acceptance-criteria section, stop and say so. Don't treat the context or description as criteria.
- Other sections, such as context, the rule or links to requirements, are **hints about where to look**, not evidence. The ticket may cite the wrong section or a wrong value. Check every claim in Confluence.

### 2. Read the documentation

Read the pages with `getConfluencePage` (`contentFormat: "markdown"`), in this order:

| # | Page | Page ID |
|---|---|---|
| 1 | `01 - Data Model` | 589825 |
| 2 | `02 - State Machine` | 196808 |
| 3 | `03 - API Contract` | 622593 |
| 4 | `04 - Frontend Spec` | 98314 |
| 5 | `06 - Business Rules` | 688129 |
| 6 | `05 - Open Questions` | 655361 |
| 7 | `07 - Clarifications` | 589846 |

`08 - UML Diagrams` (196829) is optional. Read it if a criterion concerns a flow or structure that the other pages don't settle. You don't have to read pages that clearly have nothing to do with the issue, but read too much rather than too little: a criterion that looks like a business rule is often settled by the API contract or the state machine.

Use `searchConfluenceUsingCql` (for example `space = SD1 AND text ~ "KBP-CTR-3"`) to find specific terms such as zone codes, field names, rule citations and status values. If a page is listed in a search result but isn't in the table above, read it too.

If Confluence can't be reached or a page is missing, stop and tell the user. A partial check would look like a complete one.

**Precedence between pages:**
- `07 - Clarifications` wins over `06 - Business Rules` when they disagree.
- `05 - Open Questions` decides whether an item is still open. If a criterion depends on an item that `05` lists as open, the docs don't settle it. Report it as **not described** and say it is an open question.

### 3. Judge each criterion

Split a criterion into its separate claims when it makes more than one, for example "the gate fails *and* the reason cites A-7 §1". Look for evidence for each claim, then give the criterion **one** status:

| Status | When |
|---|---|
| **covered** | Every claim is stated in the docs, or follows directly from statements in the docs that you can quote. |
| **contradicts** | At least one claim conflicts with the docs: a different value, gate, citation, state, status code, order, boundary, or behaviour. |
| **not described** | No contradiction, but at least one claim isn't in the docs, depends on an open question, or would need an assumption to be true. |

If parts of one criterion fall under different statuses, use the most serious: **contradicts**, then **not described**, then **covered**. Name the part that caused the status.

A claim **follows directly** from the docs when a short chain of quoted statements gives it with no added facts. For example, the docs say the curfew for `KBP-CTR-3` is 23:00–05:00, so a 22:00–22:45 window is outside the curfew. If you need any fact the docs don't state, the claim is **not described**. This includes how a component probably works, a reasonable default or a boundary convention.

Watch for these, because they are easy to pass over:
- **Hidden preconditions.** A criterion may only be true if other conditions hold, such as valid test data, a role or a privilege level. If the docs make it hard or impossible to set up those conditions, mention it in the evidence. The status still depends on the criterion's claims.
- **Superseded values.** The docs may quote an old value, such as one from `OH-1` v1.4 or the unadopted `CR-1`, only to rule it out. A criterion that uses that value **contradicts** the docs, even though the value appears in Confluence.
- **Different wording, same meaning.** "Shown as passed" in a criterion and "per-gate pass/fail result" in the docs describe the same thing. Judge the meaning, not the words.

### 4. Evidence

For **covered**, give each supporting source as **page → section → quote**:
- **Page:** the Confluence page title.
- **Section:** the nearest heading, for example `§1.4 TIME_WINDOW`, or the table and row.
- **Quote:** copy the source text exactly, in its original language, kept short (about 25 words at most). Never paraphrase inside quotation marks. If you can't find a sentence to copy, the claim isn't covered.

For **contradicts**, quote both sides: what the criterion says and what the docs say, with page and section.

For **not described**, name the part that is missing, and say which pages and searches you checked. If a closely related statement exists that falls short, quote it and say why it isn't enough.

## Output

Reply in the language the user wrote in. Quotes stay in their original language. Don't save a file unless the user asks for one.

Use this structure:

```markdown
## <KEY>: <issue summary>

| # | Acceptance criterion | Status | Evidence |
|---|---|---|---|
| 1 | <criterion, shortened if long> | ✅ covered | **06 - Business Rules → §1.4 TIME_WINDOW, Curfew row:** "No part of the window may fall inside the zone's curfew…" |
| 2 | … | ❌ contradicts | Criterion: "…". **03 - API Contract → Error semantics:** "…" |
| 3 | … | ⚠️ not described | No page states <missing part>. Checked: 03, 04, 06; CQL "…". Closest: **04 - Frontend Spec → Operator portal:** "…" (doesn't cover <part>). |

**Summary**
- Covered: N of M · Contradicts: N · Not described: N
- <one line for each contradiction or gap, naming the criterion number and what to raise with the ticket owner>
```

Keep the summary short, about 5 bullets at most. Don't add recommendations about code, test design or wording unless the user asks. Report the facts and let the user decide.

If the ticket's own reference to the requirements is wrong, for example the wrong page title or section, mention it in one extra bullet. It isn't an acceptance criterion and doesn't go in the table.

## When not to use this skill

| The user wants to… | Use instead |
|---|---|
| write or update test cases | `low-level-test-cases` |
| review an existing test case against the docs and the code | `test-case-reviewer` subagent |
| find business rules that have no test case | `cover-gaps` |
| write a test plan | `one-page-test-plan` (ask first whether they want a full or a one-page plan) |
| compare the SkyPermit code or `openapi.yaml` with the docs | not this skill: it uses only Confluence |
| edit, comment on or transition a Jira issue or Confluence page | not this skill: it is read-only |
