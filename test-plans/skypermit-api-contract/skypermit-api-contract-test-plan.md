# Test plan: SkyPermit API

**Version:** 3 · **Date:** 2026-10-18 · **Based on:** SkyPermit API contract; open questions list

## Objective and scope
Confirm that the SkyPermit API works as its contract defines: who can do what, how flight requests move from draft to a reviewer's decision, and how refusals are explained. Success means users can rely on the API to protect each operator's data and handle every flight request correctly.

## Test schedule
| Phase | Dates | Milestone |
|---|---|---|
| Test start | TBD | Entry criteria met |
| Test execution | TBD | All planned test cases run |
| Test end / release | TBD | Exit criteria met |

## Entry criteria
- The test environment with the API is available.
- Test data, including the zone catalogue, is ready.

## Functionality to be tested
- **Accounts:** register, log in, log out. New operators always start at the lowest authorisation level.
- **Data privacy:** operators see and change only their own data; visitors are refused; reviewers can view all data.
- **Registry:** pilots and aircraft (with calculated pilot currency and weight class), and the zone catalogue.
- **Flight requests:** create, submit, cancel within the deadline, and search by status, zone and dates.
- **Submission checks:** pilot, aircraft, zone and time-window checks run in a fixed order and stop at the first failure. Each refusal names the failed check, its rule and a clear message.
- **"Check before submitting":** gives the same result as a real submission and never changes the request.
- **Reviewer decisions:** approve, or reject with a required note. Every decision is recorded.
- **Suspended operators:** blocked from making changes, tested against the provisional response.

## Functionality not to be tested
- **User interface:** not part of API testing.
- **Individual check rules:** pilot ratings, weight, altitude and curfew rules are out of scope; only how the checks behave is tested.
- **Creating or editing zones:** the API offers no way to do it.
- **Raising an operator's authorisation level:** an administrator does it outside the API.
- **Reviewer login:** doesn't exist by design; reviewers identify themselves with a label only.

## Test approach
- **Method:** manual testing of the API against the contract, using test cases derived from it.
- **Access:** each action tried as a visitor, the owning operator, another operator and a reviewer.
- **Statuses:** each flight request action tried from allowed and not-allowed statuses (state transition testing).
- **Inputs:** valid, missing and malformed data (equivalence partitioning).
- **Consistency:** "check before submitting" compared with a real submission on the same request.

## Risks covered
| Risk | Impact if not caught | Coverage |
|---|---|---|
| Another operator's data exposed | Data breach, loss of trust | Access tests for every role |
| Request approved or moved without review | Flights authorised outside the process | Status tests for every action |
| Pre-submission check alters the request | Operators misled | Side-by-side comparison |
| Refusals don't explain what failed | Requests can't be fixed or traced | Every refusal checked |
| Suspended-operator response undecided | Tests may need redoing | Provisional tested; owner decides |

## Exit criteria
- No open blocker or critical defects.
- All positive test cases have passed.
