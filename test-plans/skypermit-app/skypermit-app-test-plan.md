# Test plan: SkyPermit

**Version:** 1 · **Date:** 2026-10-18 · **Based on:** SkyPermit requirements documents

## Objective and scope
Confirm that SkyPermit's web app and API approve or refuse flight requests according to the rules in force. Success means no forbidden flight is authorised, no valid flight is blocked, and each operator's data stays private.

## Test schedule
| Phase | Dates | Milestone |
|---|---|---|
| Test start | TBD | Entry criteria met |
| Test execution | TBD | All planned test cases run |
| Test end / release | TBD | Exit criteria met |

## Entry criteria
- The test environment with the web app and the API is available.
- Test data is ready, including the zone catalogue and one inactive zone.

## Functionality to be tested
- **Accounts and privacy:** registration and login; operators see only their own data; reviewers see all.
- **Registry:** pilots and aircraft with calculated certification status and weight class; aircraft over 30 kg are refused.
- **Request lifecycle:** create, submit, cancel (approved: up to 2 hours before flight), search; only allowed status changes, all logged.
- **Pilot and aircraft checks:** rating fits the zone, 18-month certification valid at flight time, weight class allowed.
- **Zone and time checks:** altitude ceiling, operator authorisation level, inactive zones, 6-hour to 60-day booking window, 15–240 minute duration, night curfews, no double-booked aircraft.
- **Refusals:** stop at the first failed check and give its rule and reason; "check before submitting" matches submission.
- **Reviewer queue:** pending requests, all check results, approve or reject with a note.
- **Suspended operators:** blocked from making changes, tested against the provisional response.

## Functionality not to be tested
- **Marking flights as completed:** not defined in the API contract; needs a decision.
- **Performance, load, accessibility, browsers, wider security:** not covered by the requirements.
- **Superseded rules and the unadopted change proposal:** not in force.
- **Zone editing, raising authorisation levels, reviewer login:** outside the app by design.
- **Visual design and automation selectors:** design is intentionally minimal; this kit doesn't automate.

## Test approach
- **Method:** manual, test-case-based testing of the web app and the API.
- **Limits:** values exactly at and just past each limit, such as lead time and weight classes (boundary value analysis).
- **Rule combinations:** combined pilot, aircraft, zone and time conditions (decision tables).
- **Statuses:** every action from allowed and not-allowed statuses (state transition testing).
- **Access:** every action as a visitor, the owner, another operator and a reviewer.

## Risks covered
| Risk | Impact if not caught | Coverage |
|---|---|---|
| Forbidden or double-booked flight approved | Unsafe or unlawful flight | Limit, combination and overlap tests |
| Valid flight refused | Lost business | Positive cases for every check |
| Another operator's data exposed | Data breach | Access tests |
| Retired aircraft or inactive pilot approved | Withdrawn equipment or crew flies | Not tested; allowed by design |
| Suspended-operator response undecided | Tests may need redoing | Provisional; owner decides |

## Exit criteria
- No open blocker or critical defects.
- All positive test cases have passed.
