# Request Lifecycle

A `FlightRequest` occupies exactly one of seven states at any time. **Any
transition not shown below is invalid and must return `409`** — including
transitions that look harmless, such as re-submitting something already
`UNDER_REVIEW`.

```
DRAFT ──submit──► SUBMITTED ──gates pass──► UNDER_REVIEW ──approve──► APPROVED ──complete──► COMPLETED
  │                   │                          │                        │
  │                   └──gates fail──► REJECTED ◄─┴──reject──┘             │
  │                                                                       │
  └───────────────────────── cancel ──► CANCELLED ◄──────────────────────┘
                                  ▲            ▲
                    SUBMITTED ────┘            └──── UNDER_REVIEW
```

Reading the diagram: `DRAFT` and `SUBMITTED` and `UNDER_REVIEW` can all reach
`CANCELLED` via the cancel action; `SUBMITTED` resolves immediately into
either `UNDER_REVIEW` (all gates passed) or `REJECTED` (a gate failed).

The diagram's cancel arrows and the gate pass/fail arrows cross visually —
if that's hard to parse at a glance, this table is the same information
laid out as one row per legal transition. **Any `(from, action)` pair not
listed here is illegal and must return `409`**, including where `from`
equals what looks like a plausible source state for that action (e.g.
`submit` from `UNDER_REVIEW`).

| From | Action | To | Notes |
| --- | --- | --- | --- |
| `DRAFT` | submit | `SUBMITTED` → immediately `UNDER_REVIEW` or `REJECTED` | Gates run synchronously; caller never observes `SUBMITTED` at rest |
| `SUBMITTED` | (gates pass, automatic) | `UNDER_REVIEW` | Not a caller-invoked action — part of the submit call's own outcome |
| `SUBMITTED` | (gates fail, automatic) | `REJECTED` | Same — `failing_gate`/`rejection_reason` populated |
| `UNDER_REVIEW` | approve | `APPROVED` | Reviewer-only (`X-Reviewer-Id`); writes a `ReviewAction` row |
| `UNDER_REVIEW` | reject | `REJECTED` | Reviewer-only; `note` required |
| `APPROVED` | complete | `COMPLETED` | Maintenance endpoint only — never inferred from elapsed time |
| `DRAFT` | cancel | `CANCELLED` | Operator-initiated |
| `SUBMITTED` | cancel | `CANCELLED` | Operator-initiated — only reachable in the narrow window before gates resolve it automatically |
| `UNDER_REVIEW` | cancel | `CANCELLED` | Operator-initiated |
| `APPROVED` | cancel | `CANCELLED` | Operator-initiated, **only** up to 2 hours before `window_start` — see cancellation deadline below |

Every other pair — e.g. `REJECTED`→anything, `CANCELLED`→anything,
`COMPLETED`→anything, or re-submitting something already `UNDER_REVIEW` —
is illegal and returns `409`.

## States

| State | Meaning | Terminal |
| --- | --- | --- |
| `DRAFT` | Created, never submitted. No gates have run. | no |
| `SUBMITTED` | Transient. The submit call runs all four gates and leaves this state immediately — a request should never be observed sitting in `SUBMITTED`. | no |
| `UNDER_REVIEW` | All gates passed. Awaiting a reviewer decision. | no |
| `APPROVED` | Authorised. Still cancellable until the deadline (see below). | no |
| `REJECTED` | Failed a gate, or refused by a reviewer. `failing_gate` and `rejection_reason` are populated. | **yes** |
| `CANCELLED` | Withdrawn by the operator. | **yes** |
| `COMPLETED` | Flight concluded. Set **only** by the maintenance completion endpoint — never inferred from elapsed time. | **yes** |

## Rules that affect the state machine but live elsewhere

- **Cancellation deadline.** Cancelling an `APPROVED` request is only
allowed **up to 2 hours before `window_start`**. Closer than that, the
cancel endpoint should reject it (`409` — this is a state-transition
question, not a gate failure). Source: `docs/06-business-rules.md` §5
(`TSD-4 §6`).
- **Aircraft schedule overlap.** Only `APPROVED` and `UNDER_REVIEW` requests
are counted by the overlap check inside the `AIRCRAFT` / `TIME_WINDOW`
gates. `DRAFT`, `REJECTED`, `CANCELLED` and `COMPLETED` are invisible to it
— which is why a request that passed `validate` can still fail at `submit`,
if another request for the same aircraft was approved in the interim. This
is expected behavior, not a bug to work around.

## Implementation note

Every write to `FlightRequest.state` should go through one place in the code
(not be set ad hoc from multiple endpoint handlers) so the legal-transition
check and the audit log write can't be forgotten on any path. The provided
migration also logs every state change via a database trigger as a second
line of defense — see `supabase/migrations/0001_init.sql`.
