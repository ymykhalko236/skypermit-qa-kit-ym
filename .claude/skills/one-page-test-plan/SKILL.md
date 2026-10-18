---
name: one-page-test-plan
description: Create a one-page test plan (Markdown plus a one-page PDF) that both technical and non-technical stakeholders, from QA to management, can read and use to make project decisions. The plan is built from the SkyPermit requirements in ../ct-gen-ai-skypermit/docs/ or from a file the user provides. Use this skill only when the user explicitly asks for a one-page test plan, or chooses the one-page option after being asked. Do not use it for a plain "test plan" request; ask the user first whether they want a full test plan or a one-page one.
---

# One-page test plan

The plan has to fit on one A4 page and work for a mixed audience: QA engineers, developers, product owners and management. Each reader should be able to read it in two minutes and use it to decide something: whether to approve the scope, whether the schedule works, which risks are accepted, or whether the release can go ahead.

## 1. Find the source

- If the user passed a file or path, use it as the requirements source.
- Otherwise use the SkyPermit requirements in `../ct-gen-ai-skypermit/docs/`. Read them in the order listed in this repo's `CLAUDE.md`. Follow its rules on how the docs relate: `05-open-questions.md` decides what is still open, and `07-clarifications.md` wins over `06-business-rules.md`.
- If the user wants a plan for only part of the system (one feature, one portal, one release), limit the plan to that part. If it isn't clear whether they want the whole system or a part, ask.

The SkyPermit folder is read-only. Never write anything there. Save the plan in this repo.

## 2. Ask before writing

Don't invent facts. The plan is used for decisions, so a made-up date or threshold is worse than a gap. Collect everything you can't find in the source and ask the user in **one** round of questions, before you write the draft.

Always ask for:
- **Schedule:** start date, key milestones or deadlines, and the planned end of testing or release date. Requirement docs normally don't contain this, and the schedule must never be made up. If the user doesn't have dates yet, ask how they want the section handled. Don't put in placeholders on your own.
- **Exit criteria thresholds** if the source doesn't define them. For example: is the release blocked by any open critical defect, and how many open minor defects are acceptable? You may suggest typical criteria for the user to confirm, but only write criteria the user has confirmed or the source states.

Also ask about anything else the plan would need that the source doesn't answer. Examples: whether a feature is in or out of scope, whether a test environment exists, or who decides on go/no-go if that matters for entry criteria.

## 3. Write the plan

Use this structure and order. Objective, schedule and entry criteria come first so readers immediately see what is planned, when, and what has to be ready. Scope, approach and risks follow, and the exit criteria close the plan because they define when testing is done.

```markdown
# Test plan: <system or feature name>

**Version:** <n> · **Date:** <YYYY-MM-DD> · **Based on:** <source files or document name>

## Objective and scope
<2–3 sentences: what is being tested, for which release or goal, and what "success" means for the business.>

## Test schedule
| Phase | Dates | Milestone / outcome |
|---|---|---|

## Entry criteria
- <Condition that must be true before testing starts>

## Functionality to be tested
- **<Capability>:** <what is tested, in business terms, and why it matters>

## Functionality not to be tested
- **<Item>:** <reason: out of scope / requirement not decided yet / covered by another team / ...>

## Test approach
- **<Area or method>:** <how it will be tested, in plain words>

## Risks covered
| Risk | What happens if it isn't caught | How the plan covers it |
|---|---|---|

## Exit criteria
- <Condition that must be true before testing counts as done>
```

### Section guidance

**Objective and scope.** Write for someone who reads only this section. Name the system, the goal (for example "confirm flight requests are approved or rejected correctly before launch") and the boundary of the plan.

**Functionality to be tested.** Group by business capability, not by document, endpoint or screen. Aim for 5–8 bullets. Describe what the user or business gets, for example "Operators can submit a flight request and see why it was refused", not "POST /api/v1/flight-requests returns 422".

**Functionality not to be tested.** Every item needs a reason, because the reason is what the stakeholder decides on: accept the gap, add scope, or resolve the requirement. Take exclusions from the source (non-goals, unresolved open questions, things marked as out of scope) or from the user. Don't invent exclusions. A requirement that is still undecided goes here with the reason "rules not yet decided". Say who needs to decide, if the source says so.

**Test approach.** Explain techniques by what they do. Add the formal name in brackets only if it helps QA readers, for example "check values exactly at and just past each limit, such as the maximum altitude (boundary value analysis)". Cover the main levels and types that apply, such as API checks, user-interface checks, business-rule checks, and checking that a request can only move between allowed statuses. Testing in this kit is manual, test-case-based testing. Don't promise automation unless the user says it's planned.

**Risks covered.** List product risks: things that would hurt users, the business, safety or compliance if they slipped through. Examples are approving a flight that should be refused, or blocking a valid one. Put the most damaging first. Don't add likelihood scores or numeric ratings unless the source or the user gives them. 4–6 rows is usually enough.

**Test schedule.** Only dates and milestones the user gave you.

**Entry and exit criteria.** Short, checkable conditions in their own sections: entry criteria say what must be ready before testing starts, exit criteria say when testing is done. "All critical-priority test cases executed" is checkable; "the system is stable" is not.

### Writing for every stakeholder

The test for every line: would a project manager understand it, and could they use it to make a decision? If not, rewrite it or leave it out.

- Use plain business language. Leave out code identifiers, API paths, status codes, database fields, `data-testid` values and rule reference codes. Translate them: "a request already under review can't be submitted again", not "re-submit from UNDER_REVIEW returns 409".
- Domain terms the stakeholders use themselves (flight request, operator, pilot, zone, reviewer) are fine.
- Leave out test-case-level detail (steps, test data, expected responses). It belongs in `test-cases/`, not in the plan.
- Prefer short bullets and small tables over paragraphs.
- In "Functionality to be tested", "Functionality not to be tested" and "Test approach", start every bullet with a short bold label followed by a colon, for example "**User interface:** not part of API testing." The labels let readers scan the page and find the item they need to decide on.
- Keep the whole plan to about 500 words so it fits on one page. Tables take more space than their word count suggests, so keep each table cell to a few words.

## 4. Check the draft

Before exporting, re-read the draft against the source:
- Every statement can be traced to the source or to something the user told you. Remove anything you inferred without support, or turn it into a question for the user.
- No technical identifiers slipped in.
- Every item in "Functionality not to be tested" has a reason.
- Unresolved requirements appear under "Functionality not to be tested" or "Risks covered", not as settled facts.

## 5. Save and export

1. Give each plan its own folder under `test-plans/`, named after the plan's scope, so that a plan's Markdown and PDF stay together. Save the Markdown as `test-plans/<scope-name>/<scope-name>-test-plan.md`, for example `test-plans/skypermit-api-contract/skypermit-api-contract-test-plan.md`. Use a short, descriptive, lowercase, hyphenated scope name that says what the plan covers. Create the folder if needed. If the file already exists, ask before overwriting, or save the new version with a version suffix in the same folder.
2. Export the PDF with the bundled script. It needs Node and Chrome or Edge, and no other installs:

   ```bash
   node .claude/skills/one-page-test-plan/scripts/md_to_pdf.mjs test-plans/<scope-name>/<scope-name>-test-plan.md
   ```

   The script writes the PDF next to the Markdown file and prints the page count. If it reports more than one page (exit code 2), shorten the content. Merge or cut the least decision-relevant bullets, then export again. Don't shrink the font to make it fit, because the plan has to stay readable when printed.
3. Tell the user where both files are. List anything you left out or flagged because information was missing.
