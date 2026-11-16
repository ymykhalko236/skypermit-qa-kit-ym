---
name: test-design
description: Derive a test design from a specification file using equivalence partitioning, boundary value analysis and state transition testing, and save it as JSON (<spec-name>.design.json next to the spec). Every class, boundary and transition carries a verbatim quote with its line number, and whatever the text doesn't say goes into an unknowns list instead of being guessed. Use it whenever the user points at a spec, requirements, rules or lifecycle file (Markdown or text) and asks for test design, test conditions, equivalence classes or partitions, boundary values, BVA, a state transition table or matrix, or "what should we test" for a rule, field or lifecycle, even if they don't name the techniques. Don't use it to write finished test cases, test plans or test scripts.
---

# Test design

Turn a specification into a traceable test design: equivalence classes,
boundary values and a state transition matrix, plus the list of future tests
that cover them and the questions the text leaves open.

The design is only useful if a reviewer can trust it line by line. That is why
every element points to the exact words in the spec, and why anything the spec
doesn't say becomes a question rather than a plausible guess. A guessed
expected result looks like a requirement, gets turned into a test, and then
"fails" against a system that was never told to behave that way.

## Inputs

- **Spec file** (required): a path to a text or Markdown file. If the user only
  pastes text, ask them to save it to a file first, because quotes need line
  numbers from a real file.
- **Focus** (optional): a rule, field or section, such as "duration" or
  "§3 lifecycle". With a focus, design only for that part, but read the whole
  file: the focus often depends on definitions elsewhere (units, related
  rules, error responses).

## Output

Write `<spec-name>.design.json` in the same folder as the spec, where
`<spec-name>` is the spec's file name without its extension
(`rules/payments.md` → `rules/payments.design.json`). If that file already
exists with a different `focus`, ask before overwriting it.

```json
{
  "spec": "<path to the spec file>",
  "focus": "<rule or section, if one was given; otherwise null>",
  "equivalence_classes": [
    {"id": "EP-01", "parameter": "<parameter>", "class": "8–64 characters", "valid": true, "representative": "20 characters",
     "quote": {"line": 12, "text": "<verbatim line from the spec>"}}
  ],
  "boundary_values": [
    {"id": "BV-01", "parameter": "<parameter>", "boundary": "8 characters", "inclusive": true, "step": "1 character",
     "values": [
       {"value": "7 characters", "expected": "invalid"},
       {"value": "8 characters", "expected": "valid"},
       {"value": "9 characters", "expected": "valid"}
     ],
     "quote": {"line": 12, "text": "<verbatim line from the spec>"}}
  ],
  "state_transitions": {
    "states": ["<state>"], "actions": ["<action>"],
    "matrix": [{"id": "ST-01", "from": "<state>", "action": "<action>", "result": "legal | illegal | unknown", "to": "<state or null>",
                "quote": {"line": 30, "text": "<verbatim line from the spec>"}}]
  },
  "tests": [{"id": "T-01", "covers": ["BV-01", "EP-01"]}],
  "unknowns": [{"id": "U-01", "question": "<what the text doesn't say>", "affects": ["BV-01"]}]
}
```

The values above only illustrate the format. Keep exactly these field names;
the only optional addition is `response` (see rule 5).

## Rules

1. **Verbatim quotes.** Every class, boundary and transition has a `quote`:
   the 1-based `line` number in the spec file and `text` copied from that line
   character for character, including backticks, `**`, dashes and escapes
   such as `\<`. Never paraphrase, fix typos, join two lines or drop
   characters in the middle. You may quote a contiguous fragment of the line
   rather than the whole line, as long as it is an exact substring. Get the
   line numbers from the file itself (for example with `cat -n` or the Read
   tool), not by counting in your head.

2. **What the text doesn't say goes into `unknowns`.** Don't invent it.
   Each unknown is a question and lists, in `affects`, the IDs whose expected
   result depends on the answer.

3. **Boundary values come in threes:** one step below the boundary, the
   boundary itself, and one step above. The step is the smallest unit the text
   uses (for minutes, 1 minute; for whole numbers, 1; for amounts in cents,
   0.01). A range such as "15–240" has two boundaries, so it gives two BV
   entries, each with its own three values.

4. **Inclusive or not comes only from the text**: words such as "inclusive",
   "≤", "at least", "no more than", "strictly after", "less than". If the text
   doesn't settle it, set `inclusive` to `null`, give the boundary value itself
   `"expected": "unknown"`, and add a question to `unknowns`. The values
   either side are usually still clear (with "between 7 and 90 days", 6 is
   outside and 8 is inside), so mark those normally.

   A maximum or minimum on a count or amount is settled by ordinary
   English: "up to 5 books", "no more than 3", "at most 10" include the
   limit, and "at least 12", "minimum 8" include it too. What readers
   genuinely disagree about is:
   - "between X and Y" and "from X to Y";
   - limits tied to a moment or a span of time: "up to 2 hours before",
     "until the due date", "after 60 days", "within 7 days", "before/after N".

   These count as settled only when the text also states what happens on
   the other side of the limit in words that leave no gap at the boundary
   itself ("allowed up to 2 hours before. Closer than that, it is refused"
   settles that exactly 2 hours is allowed, because exactly 2 hours is not
   closer). In that case quote the line that does the settling. Otherwise
   treat them as unsettled.

   Your answer and your questions must agree. If you find yourself writing
   an unknown that asks whether a boundary is inclusive, or whether the
   boundary value itself is allowed, that boundary is unsettled: `inclusive`
   is `null` and the boundary value is `unknown`. A boundary is never both
   decided and asked about. A question about something else, such as the
   precision of the comparison, is fine on a settled boundary.

5. **`expected` is only `valid`, `invalid` or `unknown`.** What the system
   returns on a violation (status code, error text, error field) goes in only
   if the text states it, as a `response` field with its own quote, for
   example `"response": {"value": "409", "quote": {"line": 4, "text": "..."}}`.
   You can put `response` on a boundary value, a class or a matrix cell. If
   the text doesn't state the response, leave the field out and add **one**
   question per parameter to `unknowns` (not one per value).

   `expected` describes the outcome of the whole input under the spec. If a
   value satisfies the boundary under test but breaks another rule in the
   same spec (a 1-minute window passes "end after start" but fails "at least
   15 minutes"), it is `invalid`. Note the interaction in an unknown only if
   the text leaves it unclear.

6. **Don't invent classes the text doesn't define**, such as empty values,
   null, wrong types, negative numbers or extra-long strings. If the text is
   silent about them, add **one** question per parameter to `unknowns` asking
   how such inputs are handled. Classes the text does define (explicitly or
   by naming both sides of a limit) are fine, including the invalid ones on
   either side of a range.

7. **States: a full state × action table.** The matrix has exactly one cell
   for every pair of a state in `states` and an action in `actions`. Use the
   states the text names. For `actions`, take the transitions' actions plus
   any other operation the text ties to the object's lifecycle, wherever in
   the text it appears: one that changes the state, or one the text limits
   by state or by count ("a loan may be renewed once" is an action even if
   it is described outside the list of transitions; leaving it out hides its
   cells). An operation mentioned only in passing, with nothing said about
   states (a "validate" step named in an explanation), is not an action.
   Include automatic events if the text lists them as transitions. A
   general rule such as "any other transition is forbidden" is a valid
   quote for every pair that isn't in the list of allowed transitions,
   including pairs for actions you added yourself: such a rule decides those
   cells as `illegal`, so don't mark them `unknown`. `to` is the target state for `legal` cells and `null`
   otherwise. A cell is `unknown` only when the text has neither an explicit
   transition nor a general rule that covers it; give each such cell (or
   group of cells) an entry in `unknowns`. A transition allowed only under a
   condition (a deadline, a role) is `legal`, and the condition itself is
   material for classes and boundaries.

8. **No states in the text** → `"state_transitions": {"not_applicable": "<why>"}`.
   Don't build a lifecycle out of a spec that only defines input rules.

9. **`tests` is the list of future tests.** Each test covers one or more
   elements by ID in `covers`. No equivalence class, boundary or matrix cell
   may be left without a test. Combine elements only when one input really
   exercises all of them (a representative that also sits on a boundary);
   keep invalid classes in separate tests so one failure can't mask another.

10. **IDs** are sequential and zero-padded: `EP-01`, `BV-01`, `ST-01`, `T-01`,
    `U-01`. Every ID in `covers` and `affects` must exist.

## Workflow

1. Read the whole spec with line numbers. Find the focus, and the
   definitions, units, error responses and general rules it relies on.
2. List the parameters with their constraints, and any states and actions.
3. Build the equivalence classes, then the boundary values, then the matrix.
   For each one, copy the quote from the numbered file.
4. While building, write down every gap as an unknown: inclusivity, the
   response to a violation, unspecified inputs, unspecified transitions,
   rules that contradict each other.
5. Write the tests so that everything is covered.
6. Save the JSON, then run the checker from this skill's folder:

   ```bash
   node <skill-dir>/scripts/check_design.mjs <path-to>.design.json
   ```

   It checks that each quote is an exact substring of its line, that each
   boundary has three values, that the matrix is complete, that IDs resolve
   and that nothing is uncovered. Fix every error it reports and run it again
   until it passes. Treat warnings as prompts to look again.
7. Reply with a short summary: the file path, the counts (classes,
   boundaries, cells by result, tests, unknowns), and the unknowns as a list
   of questions for the spec owner, since those are what someone has to
   answer before the tests can be finished.
