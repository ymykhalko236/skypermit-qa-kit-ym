---
name: low-level-test-cases
description: Generate low-level, atomic test cases as Markdown files in test-cases/, one file per test case, with ID, summary, dates, preconditions, numbered steps with an expected result for every step, postconditions, priority and source. Works from a file the user provides, from the SkyPermit requirements in ../ct-gen-ai-skypermit/docs/, or from a description given in the chat. Use it whenever the user asks to write, generate, create, add or update test cases, including detailed, low-level or manual test cases, or test cases for a specific requirement, rule, feature or bug. Don't use it for test plans, test scenarios, end-to-end flows or automated test scripts.
---

# Low-level test cases

A low-level test case is concrete enough for any tester to run it the same way and reach the same verdict without guessing. It is also **atomic**: it checks exactly one test condition, such as one rule, one boundary value, or one allowed or forbidden action. It is not a scenario or a flow that walks through several behaviours. Atomic test cases fail for exactly one reason, which keeps defect reports clear and lets each test case be prioritised, assigned and re-run on its own.

## 1. Find the source

Use the source the user points to, in this order:
- **A file the user passes:** use that file.
- **A description in the chat:** use the description. If it leaves out anything a step or expected result needs, ask; don't fill the gap from general knowledge.
- **Otherwise:** use the SkyPermit requirements in `../ct-gen-ai-skypermit/docs/`. Read the documents that cover the requested feature, following this repo's `CLAUDE.md` on how the docs relate: `05-open-questions.md` decides what is still open, and `07-clarifications.md` wins over `06-business-rules.md`.

The SkyPermit `docs/` folder is the main source of truth. You may also read anything else in the SkyPermit folder, such as `public/openapi.yaml` for status codes, required fields and field formats, to fill in details the docs leave out. If another file contradicts `docs/`, follow `docs/` and tell the user about the conflict. Cite every file you use in the test case's **Source** field.

Decisions the user makes in the chat, when the sources are silent, are valid sources too. Cite them as "Chat decision, dd/mm/yyyy: <what was decided>".

The SkyPermit folder is read-only. Never write anything there.

Every expected result has to be traceable to the source. If the source doesn't say what should happen, the test case can't be written yet. Ask, or report it as a gap. An expected result made up from "what systems usually do" produces a test case that passes or fails for the wrong reason.

## 2. Break the request into atomic test cases

Work out which test conditions the request covers. A single request often needs several test cases. For example, "test the altitude ceiling" needs one test case for an altitude exactly at the ceiling, one just above it, and one well below it. Each condition becomes its own test case.

A test case is atomic when:
- Its summary describes one condition and one outcome, for example "Flight request with altitude 1 m above the zone ceiling is refused by the zone check".
- Its steps only set up and trigger that one condition and observe its result. Setup that isn't the point of the test belongs in **Preconditions**, not in the steps.
- It doesn't depend on another test case having run first.

If you find yourself writing "then also check...", or a second action whose result is a different behaviour, that's a second test case.

## 3. Confirm with the user before writing

Show the user the list of test cases you plan to create and wait for their confirmation. Sort the list by proposed priority: all priority 1 test cases first, then 2, then 3, with priority 4 last. Write the files in that same order. Generating the most important test cases first means that, if the work stops part-way or the user asks for only some of them, the highest-risk conditions are already covered. If the user changes a priority, re-sort the list before writing. Put any questions about missing information in the same message, so there is **one** round of questions. For each planned test case show:

- the ID it will get (see section 4)
- the summary
- the proposed priority, with a one-line reason
- the source (document and section, file name, or "chat description")

Ask in the same round about anything the source doesn't settle, for example:
- **Interface:** whether to test through the user interface or the API, if the request doesn't say.
- **Values the rules depend on** that the source doesn't give, such as a limit, a format or an error message.
- **Unresolved requirements:** if a test case depends on a requirement listed as open in `05-open-questions.md`, say so and ask how to handle it.
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

- **ID:** the area prefix plus a three-digit number, for example `TC-FR-007`. Find the highest number already used in that area's folder and add one. Never reuse a number, even if an older test case was deleted. When creating several test cases in one area, number them in the order of the priority-sorted list, so lower numbers go to higher priorities within that batch.
- **File name:** `<ID>-<short-name>.md`, for example `TC-CHK-012-altitude-above-zone-ceiling-is-refused.md`. The short name is a few lowercase, hyphenated words from the summary.
- Create the area folder if it doesn't exist.

## 5. Write each test case

Every time this skill runs, read the template in `templates/test-case-template.md` before writing any test case, and build each file from it. Keep its sections, field order and table layout exactly. Replace every `<placeholder>` with real content, and leave no placeholder text behind. The template is the single definition of the test case format: if the format needs to change, change the template, not this file.

Also read the finished example in `examples/TC-ACC-001-valid-registration-creates-l1-operator-and-signs-in.md`. It shows the level of detail expected:
- preconditions with concrete data
- one action per step, with the exact request and values
- several observable expected results in one row
- postconditions that explain how to re-run the test
- a priority with a reason
- a source that names document sections

Match its level of detail. Don't copy its content: every test case gets its own data, steps and results from its own source.

### Field rules

- **Dates:** use the format `dd/mm/yyyy`. For a new test case, both dates are today's date.
- **Assigned To:** always leave it empty. The user fills it in.
- **Preconditions:** list everything that must be true before step 1, with concrete data. For example, "Operator account `op-a@test.example` exists at authorisation level L1 and is logged in", or "Zone DNI-OPN-1 exists with a ceiling of 120 m". If nothing is needed, write "None".
- **Steps:** one action per step, in the imperative ("Enter…", "Click…", "Send…"). Name the exact screen, field, button or API call and the exact values to use. For example, "Enter `121` in the Altitude field", not "enter an altitude above the ceiling". Technical identifiers such as endpoints, request fields and `data-testid` values are welcome here, because the readers are testers.
- **Expected results:** every step has at least one expected result in the same row, including setup-like steps such as "the form opens". Each result is something a tester can observe and compare: a message, a status, a value, a field state or a response code. Every step, whatever its number, can have one or as many expected results as the source supports. The number of results in a row has nothing to do with the step's position. Start each result with `•` and separate them with `<br>`, even when a row has only one. Avoid vague results such as "works correctly" or "an error is shown". Say which error, and where it appears.
- **Test data:** use concrete values. Values the rules depend on (limits, weights, times, ratings, zone settings) must come from the source. Purely identifying data, such as names, emails and serial numbers, can be invented, but make it look like test data (for example `Test Pilot A`, `SN-TEST-0001`).
- **Postconditions:** what the system looks like afterwards, for example "Request remains in DRAFT", and any cleanup needed to run the test again. If nothing changes and no cleanup is needed, write "None".
- **Priority:** propose one; the user confirms it in section 3. The scale is 1 (highest) to 4 (lowest):
  - **1:** if this failed, the system would allow something the rules forbid, block its core purpose, or expose another operator's data.
  - **2:** a main function would be wrong, with no reasonable workaround.
  - **3:** a secondary function or error handling would be wrong, or a workaround exists.
  - **4:** low impact, such as wording or minor presentation.
- **Expected results to be confirmed:** if the user decides to write a test case before the correct behaviour is known, start each affected expected result with `**TBC:**` and describe the possible outcomes. Keep every result that holds either way as a normal expected result. Add a "**To be confirmed:**" note under **Source** that says what is undecided and who needs to decide. Mention TBC test cases in your report, so they don't get forgotten.
- **Source:** the exact document and section the expected results come from, for example `06-business-rules.md §1.3, altitude within ceiling`. This gives traceability: it shows which requirement the test case covers and which test cases to update when that requirement changes.

## 6. Check each test case

Before saving, check each test case:
- It covers one condition. If not, split it, and tell the user about the extra test case it produced.
- Every step has at least one expected result, and every expected result is backed by the source.
- No step or result uses vague wording that two testers could carry out or judge differently.
- The ID is unique, and the file name starts with the ID.
- It has every section and field from `templates/test-case-template.md`, in the same order, and no `<placeholder>` text is left.

## 7. Updating existing test cases

When the user asks you to change an existing test case:
- Keep its ID, Date Created and file name.
- Set Date Last Updated to today's date (`dd/mm/yyyy`).
- If the change affects the summary so much that the file name no longer fits, ask before renaming the file.
- If a copy of the test case is also kept in this skill's `examples/` folder, apply the same change to that copy, so the example always matches the real test case.

## 8. Report back

List the files you created or changed with their IDs and summaries. Also list anything you couldn't cover because the source didn't specify it.
