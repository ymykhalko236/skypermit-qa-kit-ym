# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

This repo (`skypermit-qa-kit`) is a kit for **generating testware**, such as test plans and test cases, for SkyPermit. The testware is derived from the requirements in the **SkyPermit Docs** Confluence space.

It is **not** for automated tests. Don't write test scripts, test frameworks or automation code (Playwright, Vitest, etc.) here, and don't add build or test tooling for that purpose.

When the user asks for a test plan without saying which kind, ask whether they want a full test plan or a one-page one. Use the `one-page-test-plan` skill only for a one-page plan, which is written in Markdown and exported to a one-page PDF. Test cases are low-level and atomic, one Markdown file per test case, written with the `low-level-test-cases` skill. The format for any other testware hasn't been decided yet. Ask before choosing one.

`README.md` is UTF-16 LE encoded (it was created on Windows). Convert it to UTF-8 before editing so diffs and tools work.

## Planned structure

These directories are planned and may not exist yet:

- `test-plans/`: test plans and test strategy documents, with one descriptively named folder per plan holding its Markdown and PDF (for example `test-plans/skypermit-app/`).
- `test-cases/`: generated test cases, in one folder per functional area (`accounts`, `registry`, `flight-requests`, `checks`, `reviewer-queue`). Files are named `<ID>-<short-name>.md`, for example `test-cases/checks/TC-CHK-001-altitude-above-zone-ceiling-is-refused.md`.
- `.claude/`: Claude Code configuration for this repo.
  - `.claude/skills/`: project skills for generating testware. Claude Code loads skills from this location automatically.
    - `one-page-test-plan/`: creates a one-page test plan for all stakeholders. Its `scripts/md_to_pdf.mjs` exports the Markdown to PDF using Node and headless Chrome or Edge.
    - `low-level-test-cases/`: creates and updates atomic, low-level test cases in `test-cases/`. It defines the ID prefix for each area.
    - `cover-gaps/`: finds business rules with no test case yet (its `scripts/find_gaps.mjs` matches each test case's **Business Rule** ID against `06-business-rules.md` §5–§6 plus `07` corrections, read from the local docs folder: see the exception under "Source of requirements"), writes test cases for them, has each one reviewed, removes non-compliant ones and logs undecidable ones in `open-questions.md`. Summaries go to `reports/cover-gaps-*.json`; IDs of removed test cases go to `test-cases/retired-ids.txt` so they are never reused.
    - `story-doc-check/`: takes a `jira-intake` record (by issue key, file path or pasted JSON, and it doesn't read Jira itself) and reports, for each acceptance criterion, whether the SkyPermit Docs Confluence space has it covered (with page, section and quote), contradicts it, or doesn't describe it. Uses only Confluence as evidence, is read-only and returns a table and a short summary in chat.
    - `jira-intake/`: takes a Jira issue key and returns a JSON record with `key`, `title`, `check_type`, `acceptance_criteria`, `confluence_url` and `notes`. Reads only Jira and never guesses: `check_type` comes only from a single `ui` or `api` label, and `confluence_url` only from a real link in the ticket. Missing values are `null`, with the reason in `notes`. Results go to chat and to `reports/jira-intake/<KEY>.json`.
  - `.claude/agents/test-case-reviewer.md`: a read-only subagent that checks one test case against the SkyPermit docs in Confluence and the SkyPermit code, and returns a verdict with evidence.
  - `.claude/agents/implementation-check.md`: a read-only subagent (Read, Grep and Glob only) that takes a `jira-intake` record and reports, for each acceptance criterion, whether the SkyPermit code implements it (gate logic, endpoint, display, `data-testid`). Each criterion is `implemented` with `file:line` evidence, `partial` (what is present and what isn't) or `not_found`, and the overall verdict is `implemented`, `partial` or `not_implemented`. It takes the criteria as written and doesn't read Confluence.
- `.mcp.json`: project-scoped MCP servers. It currently defines two servers, both over HTTP. Neither stores secrets in the file:
  - `atlassian`: Jira and Confluence, using OAuth sign-in. It is how the kit reads the SkyPermit requirements.
  - `testomatio`: Testomat.io test management for the SkyPermit project. Its URL contains only the project slug.

## Source of requirements

SkyPermit is a drone airspace authorisation system. Its requirements live in Confluence, in the **SkyPermit Docs** space (key `SD1`, site `yaroslavmyhalko236.atlassian.net`, cloud ID `34bbf7e9-2a64-4a58-bf3d-d5fed950d0c5`). Read them only through the `atlassian` MCP server's read tools:
- `getConfluencePage`: reads one page. Pass `contentFormat: "markdown"`.
- `getPagesInConfluenceSpace` / `getConfluencePageDescendants`: list the pages.
- `searchConfluenceUsingCql`: finds a term across the space.

Don't read requirements from `../ct-gen-ai-skypermit/docs/` any more. The only exception is described below. If Confluence can't be reached (the server isn't connected, you aren't signed in, or a page is missing), stop and tell the user. Don't silently fall back to the local files.

Read the pages in this order:

| # | Page | Page ID |
|---|---|---|
| 1 | `01 - Data Model` | 589825 |
| 2 | `02 - State Machine` | 196808 |
| 3 | `03 - API Contract` | 622593 |
| 4 | `04 - Frontend Spec` | 98314 |
| 5 | `06 - Business Rules` | 688129 |
| 6 | `05 - Open Questions` | 655361 |
| 7 | `07 - Clarifications` | 589846 |

There is also `08 - UML Diagrams` (196829). A page's URL is `https://yaroslavmyhalko236.atlassian.net/wiki/spaces/SD1/pages/<page ID>`.

Older testware cites the old file names, such as `06-business-rules.md`. Treat each one as the Confluence page with the same number (`06 - Business Rules`).

How the pages relate matters for test design:
- `05 - Open Questions` is the single source of truth for whether each question is still open or resolved. A few items are still genuinely unresolved, such as `Operator.status = SUSPENDED` handling and the citation for the zone-active rule. Flag tests that depend on these items instead of inventing expected results.
- `07 - Clarifications` explains why each question was resolved the way it was. It also contains a confirmed correction to `06 - Business Rules`: the aircraft weight-band rule belongs to the `AIRCRAFT` gate, even though the cited source text says "zone gate". When `06` and `07` disagree, follow `07`.

If a requirement is ambiguous or contradictory, raise it with the user. Don't pick a silent default for an expected result.

### Exception: `find_gaps.mjs` reads the local docs

`.claude/skills/cover-gaps/scripts/find_gaps.mjs` is a Node script, and Node scripts can't call MCP tools. It keeps reading `06-business-rules.md` from `../ct-gen-ai-skypermit/docs/` (or from the folder given with `--docs`). It is the only part of the kit that reads requirements from local files. If its output disagrees with the Confluence page `06 - Business Rules`, tell the user that the local copy may be out of date.

### Confluence is read-only for this kit

Never create, edit or comment on pages in the SkyPermit Docs space while generating or reviewing testware.

## Restrictions on the sibling SkyPermit repo

`../ct-gen-ai-skypermit` is **read-only**. Never create, edit, move or delete files there. All generated testware goes in this repo.

You may still read the repo's code (`app/`, `components/`, `lib/`, `supabase/`, `tests/`), for example to find `data-testid` selectors or to check what the code does. You may also read `public/openapi.yaml` for API details the Confluence pages leave out. If the code or `openapi.yaml` contradicts Confluence, follow Confluence and tell the user about the conflict. Apart from `find_gaps.mjs`, don't read requirements from its `docs/` folder.
