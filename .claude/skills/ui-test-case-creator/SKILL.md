---
name: ui-test-case-creator
description: Generate low-level, atomic UI/E2E test cases as Markdown files in test-cases/, one file per test case. This skill writes ONLY test cases that run through the SkyPermit web interface, using its forms and data-testid selectors. It derives every needed test case with equivalence partitioning, boundary value analysis and state transition testing. Each file has an ID, summary, dates, preconditions, numbered steps with an expected result for every step, postconditions, priority and source. Works from a file the user provides, from the SkyPermit requirements in the SkyPermit Docs Confluence space, or from a description given in the chat. Use it whenever the user asks to write, generate, create, add or update UI, E2E, form, manual or low-level test cases, or test cases for a specific requirement, rule, feature or bug, unless they ask for API test cases. Don't use it for API test cases (requests, status codes, response bodies), which belong to a separate API test case skill, or for test plans, test scenarios or automated test scripts.
model: sonnet
allowed-tools: mcp__atlassian__getConfluencePage, mcp__atlassian__getPagesInConfluenceSpace, mcp__atlassian__getConfluencePageDescendants, mcp__atlassian__searchConfluenceUsingCql
---

# UI test case creator

A low-level test case is concrete enough for any tester to run it the same way and reach the same verdict without guessing. It is also **atomic**: it checks exactly one test condition, such as one rule, one boundary value, or one allowed or forbidden action. It is not a scenario or a flow that walks through several behaviours. Atomic test cases fail for exactly one reason, which keeps defect reports clear and lets each test case be prioritised, assigned and re-run on its own.

This skill writes **only UI/E2E test cases**. Each one drives the real web interface end to end: the tester fills in forms, clicks controls and observes the result on screen, and every element is named by its `data-testid`. "E2E" describes the route through the system, not the size of the test: each test case is still atomic.

## When not to use this skill

| The user wants to… | Use instead |
|---|---|
| write or update API test cases (requests, status codes, response bodies) | the separate API test case skill. If it doesn't exist yet, say so and stop. Don't write an API test case here. |
| review a test case against the docs and the code | `test-case-reviewer` subagent |
| find business rules that have no test case | `cover-gaps` |
| write a test plan | `one-page-test-plan` (ask first whether they want a full or a one-page plan) |
| write automated test scripts | not this kit: it doesn't hold automation code |

## 1. Find the source

Use the source the user points to, in this order:
- **A file the user passes:** use that file.
- **A description in the chat:** use the description. If it leaves out anything a step or expected result needs, ask; don't fill the gap from general knowledge.
- **Otherwise:** use the SkyPermit requirements in the **SkyPermit Docs** Confluence space (key `SD1`). Read the pages that cover the requested feature with `getConfluencePage` (`contentFormat: "markdown"`). The page IDs and the rules on how the pages relate are in this repo's `CLAUDE.md`: `05 - Open Questions` decides what is still open, and `07 - Clarifications` wins over `06 - Business Rules`. Don't read requirements from `../ct-gen-ai-skypermit/docs/`. If Confluence can't be reached, stop and tell the user.

The Confluence pages are the main source of truth. You may also read the SkyPermit repo (`../ct-gen-ai-skypermit`): `public/openapi.yaml` for required fields and field formats, and the code (`app/`, `components/`, …) for `data-testid` selectors and for what each screen displays. If either contradicts Confluence, follow Confluence and tell the user about the conflict. Cite every page and file you use in the test case's **Source** field.

Find every `data-testid` in the code of the screen under test. Never guess or invent one. If an element the test case needs has no `data-testid`, report it as a gap: `04 - Frontend Spec` says every interactive element must carry one.

Decisions the user makes in the chat, when the sources are silent, are valid sources too. Cite them as "Chat decision, dd/mm/yyyy: <what was decided>".

The SkyPermit repo and the Confluence space are read-only. Never write anything to either.

Every expected result has to be traceable to the source. If the source doesn't say what should happen, the test case can't be written yet. Ask, or report it as a gap. An expected result made up from "what systems usually do" produces a test case that passes or fails for the wrong reason.

## 2. Break the request into atomic test cases

Work out which test conditions the request covers, using the techniques below. A single request often needs several test cases. Each condition becomes its own test case.

### Test design techniques

Generate every test case the feature needs. Apply each technique that fits the feature, and note which one produced each planned test case:

- **Equivalence partitioning:** split each input into valid and invalid partitions, based on what the source says. This covers typed fields and pickers, for example a pilot whose certification is current or lapsed. Write one test case per partition. Each invalid test case uses one invalid value and keeps everything else valid, so that it can fail for only one reason.
- **Boundary value analysis (2-value):** for each input with an ordered limit, test the boundary value and its closest neighbour in the adjacent partition. Take the step size from the source. For example, a duration of 15 to 240 minutes gives 14, 15, 240 and 241. A zone ceiling of 120 m gives 120 and 121.
- **State transition testing:** for anything with a lifecycle, build the states and transitions from `02 - State Machine`. Write one test case per valid transition that the UI offers, and one per invalid transition the source defines. Put the start state in **Preconditions**, make the trigger a UI action, and observe the resulting state on screen, for example with the `state-badge-<state>` selector. Actions that must not change state count too, such as "Check before submitting".

Don't duplicate coverage. A boundary test case also covers its partition, so add a separate partition test case only for a partition no boundary test case reaches.

### What the UI can test

Every expected result has to be visible in the UI. If a condition can only be seen through the API, such as a status code or a value no screen displays (`authorisation_level`, for example), don't write it here. List it in your report for the API test case skill.

`04 - Frontend Spec` says the form does not pre-filter: pickers offer combinations that can't pass, and the rules run only at "Check before submitting" and at submit. So observe a rule's result there, not while the form is being filled in. A gate result appears in the `flight-request-gate-result-<GATE>` card, with its `data-gate-status`, message and rule reference.

A test case is atomic when:
- Its summary describes one condition and one outcome, for example "Flight request with altitude 1 m above the zone ceiling is refused by the zone check".
- Its steps only set up and trigger that one condition and observe its result. Setup that isn't the point of the test belongs in **Preconditions**, not in the steps.
- It doesn't depend on another test case having run first.

If you find yourself writing "then also check...", or a second action whose result is a different behaviour, that's a second test case.

## 3. Confirm with the user before writing

Show the user the list of test cases you plan to create and wait for their confirmation. Sort the list by proposed priority: all priority 1 test cases first, then 2, then 3, with priority 4 last. Write the files in that same order. Generating the most important test cases first means that, if the work stops part-way or the user asks for only some of them, the highest-risk conditions are already covered. If the user changes a priority, re-sort the list before writing. Put any questions about missing information in the same message, so there is **one** round of questions. For each planned test case show:

- the ID it will get (see section 4)
- the summary
- the technique that produced it, and the value or transition it covers
- the proposed priority, with a one-line reason
- the source (Confluence page and section, file name, or "chat description")

Ask in the same round about anything the source doesn't settle, for example:
- **Not visible in the UI:** any condition the request covers that can only be checked through the API. Say so, and leave it out of the plan.
- **Values the rules depend on** that the source doesn't give, such as a limit, a format or an error message.
- **Unresolved requirements:** if a test case depends on a requirement listed as open in `05 - Open Questions`, say so and ask how to handle it.
- **Area:** if a test case doesn't fit any existing area folder, ask which area it belongs to.

The user may add, remove or change test cases, or change priorities. Only write the files after they confirm.

## 4. IDs, file names and folders

Store test cases under `test-cases/`, in one folder per functional area. Each area has its own ID prefix:

| Area folder | Covers | ID prefix |
|---|---|---|
| `accounts` | registration, login, logout, data privacy between operators | `TC-ACC-` |
| `registry` | pilots, aircraft and the zone catalogue | `TC-REG-` |
| `flight-requests` | creating, submitting, cancelling and searching requests; allowed status changes | `TC-FR-` |
| `checks` | the four submission checks (pilot, aircraft, zone, time window) and "check before submitting" | `TC-CHK-` |
| `reviewer-queue` | the reviewer's queue, approving and rejecting | `TC-RQ-` |

If a new area is needed, agree its folder name and prefix with the user, then add it to this table.

- **ID:** the area prefix plus a three-digit number, for example `TC-FR-007`. Find the highest number already used in that area's folder, or listed in `test-cases/retired-ids.txt` (IDs of deleted test cases, one per line), and add one. Never reuse a number, even if an older test case was deleted. When creating several test cases in one area, number them in the order of the priority-sorted list, so lower numbers go to higher priorities within that batch.
- **File name:** `<ID>-<short-name>.md`, for example `TC-CHK-012-altitude-above-zone-ceiling-is-refused.md`. The short name is a few lowercase, hyphenated words from the summary.
- Create the area folder if it doesn't exist.

## 5. Write each test case

Every time this skill runs, read the template in `templates/test-case-template.md` before writing any test case, and build each file from it. Keep its sections, field order and table layout exactly. Replace every `<placeholder>` with real content, and leave no placeholder text behind. The template is the single definition of the test case format: if the format needs to change, change the template, not this file.

Also read the finished example in `examples/TC-ACC-000-valid-registration-through-the-form-signs-the-operator-in.md`. Its ID is reserved for the example, so it is not a real test case. It shows the level of detail expected:
- preconditions with concrete data
- one action per step, with the exact `data-testid` and values
- several observable expected results in one row
- postconditions that explain how to re-run the test
- a priority with a reason
- a source that links the Confluence pages and names their sections

Match its level of detail. Don't copy its content: every test case gets its own data, steps and results from its own source.

### Field rules

- **Dates:** use the format `dd/mm/yyyy`. For a new test case, both dates are today's date.
- **Assigned To:** always leave it empty. The user fills it in.
- **Business Rule:** the ID of the business rule the test case covers, as listed by the `cover-gaps` skill's `scripts/find_gaps.mjs` (for example `BR-ZONE-ALTITUDE`). Run that script to look the ID up when a test case comes from `06 - Business Rules`. (The script reads a local copy of that page; see the exception in `CLAUDE.md`.) Separate several IDs with commas. Write `N/A` when the test case doesn't cover a business rule, such as registration or login. This is how `cover-gaps` tells which rules already have test cases, so an ID missing here makes the rule look uncovered. Test cases written before this field existed may lack the row; treat that as `N/A`.
- **Preconditions:** list everything that must be true before step 1, with concrete data. For example, "Operator account `op-a@test.example` exists at authorisation level L1 and is logged in", or "Zone DNI-OPN-1 exists with a ceiling of 120 m". If nothing is needed, write "None".
- **Steps:** one action per step, in the imperative ("Open…", "Enter…", "Select…", "Click…"). Name the exact screen, the field or button with its `data-testid`, and the exact values to use. For example, "Enter `121` in the Altitude field (`<data-testid>`)", not "enter an altitude above the ceiling". Never use an API call as a step.
- **Expected results:** every step has at least one expected result in the same row, including setup-like steps such as "the form opens". Each result is something a tester can see on screen and compare: a message, a state badge, a displayed value, a field state or the page shown. Name the `data-testid` of the element to check. Never use a response code or a response body as a result. Every step, whatever its number, can have one or as many expected results as the source supports. The number of results in a row has nothing to do with the step's position. Start each result with `•` and separate them with `<br>`, even when a row has only one. Avoid vague results such as "works correctly" or "an error is shown". Say which error, and where it appears.
- **Test data:** use concrete values. Values the rules depend on (limits, weights, times, ratings, zone settings) must come from the source. Purely identifying data, such as names, emails and serial numbers, can be invented, but make it look like test data (for example `Test Pilot A`, `SN-TEST-0001`).
- **Postconditions:** what the system looks like afterwards, for example "Request remains in DRAFT", and any cleanup needed to run the test again. If nothing changes and no cleanup is needed, write "None".
- **Priority:** propose one; the user confirms it in section 3. The scale is 1 (highest) to 4 (lowest):
  - **1:** if this failed, the system would allow something the rules forbid, block its core purpose, or expose another operator's data.
  - **2:** a main function would be wrong, with no reasonable workaround.
  - **3:** a secondary function or error handling would be wrong, or a workaround exists.
  - **4:** low impact, such as wording or minor presentation.
- **Expected results to be confirmed:** if the user decides to write a test case before the correct behaviour is known, start each affected expected result with `**TBC:**` and describe the possible outcomes. Keep every result that holds either way as a normal expected result. Add a "**To be confirmed:**" note under **Source** that says what is undecided and who needs to decide. Mention TBC test cases in your report, so they don't get forgotten.
- **Source:** the exact Confluence page and section the expected results come from. Write it as a Markdown link to the page, followed by the section, for example `[06 - Business Rules](https://yaroslavmyhalko236.atlassian.net/wiki/spaces/SD1/pages/688129) §1.3, altitude within ceiling`. Cite repo files such as `public/openapi.yaml` by path. This gives traceability: it shows which requirement the test case covers and which test cases to update when that requirement changes.

## 6. Check each test case

Before saving, check each test case:
- It covers one condition. If not, split it, and tell the user about the extra test case it produced.
- It runs only through the UI, and every `data-testid` it names exists in the code.
- Every step has at least one expected result, and every expected result is backed by the source.
- No step or result uses vague wording that two testers could carry out or judge differently.
- The ID is unique, and the file name starts with the ID.
- It has every section and field from `templates/test-case-template.md`, in the same order, and no `<placeholder>` text is left.

## 7. Updating existing test cases

When the user asks you to change an existing test case:
- If it is an API test case, don't update it or convert it to UI here. Older test cases in `test-cases/` are API test cases: tell the user they belong to the API test case skill.
- Keep its ID, Date Created and file name.
- Set Date Last Updated to today's date (`dd/mm/yyyy`).
- If the change affects the summary so much that the file name no longer fits, ask before renaming the file.
- If a copy of the test case is also kept in this skill's `examples/` folder, apply the same change to that copy, so the example always matches the real test case.

## 8. Report back

List the files you created or changed with their IDs and summaries. Also list anything you couldn't cover because the source didn't specify it, and any condition left for the API test case skill.
