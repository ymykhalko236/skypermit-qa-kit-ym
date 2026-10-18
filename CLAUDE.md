# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

This repo (`skypermit-qa-kit`) is a kit for **generating testware**, such as test plans and test cases, for SkyPermit. The testware is derived from the requirements in the SkyPermit repo's `docs/` folder.

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
  - `.claude/agents/test-case-reviewer.md`: a read-only subagent that checks one test case against the SkyPermit docs and code and returns a verdict with evidence.

## Source of requirements

The requirements live in the sibling repo `../ct-gen-ai-skypermit`, in its `docs/` folder. SkyPermit is a drone airspace authorisation system. Its `CLAUDE.md` gives the recommended reading order for those docs:

1. `01-data-model.md`
2. `02-state-machine.md`
3. `03-api-contract.md`
4. `04-frontend-spec.md`
5. `06-business-rules.md`
6. `05-open-questions.md`
7. `07-clarifications.md`

There is also `08-uml-diagrams.md`.

How the docs relate matters for test design:
- `05-open-questions.md` is the single source of truth for whether each question is still open or resolved. A few items are still genuinely unresolved, such as `Operator.status = SUSPENDED` handling and the citation for the zone-active rule. Flag tests that depend on these items instead of inventing expected results.
- `07-clarifications.md` explains why each question was resolved the way it was. It also contains a confirmed correction to `06-business-rules.md`: the aircraft weight-band rule belongs to the `AIRCRAFT` gate, even though the cited source text says "zone gate". When `06` and `07` disagree, follow `07`.

If a requirement is ambiguous or contradictory, raise it with the user. Don't pick a silent default for an expected result.

## Restrictions on the sibling SkyPermit repo

`../ct-gen-ai-skypermit` is **read-only**. Never create, edit, move or delete files there. All generated testware goes in this repo.

You may read anything in that repo. `docs/` is the main source of truth. Other files, such as `public/openapi.yaml`, can fill in details the docs leave out, but if they contradict `docs/`, follow `docs/` and tell the user about the conflict.
