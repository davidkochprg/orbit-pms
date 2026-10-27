# 4. Human approval for mutations

## Context

An agent that changes bookings on its own can make costly mistakes, and front-desk staff need to stay in control.

## Decision

Read-only tools run freely. Mutating tools (create hold, confirm, cancel, move, change dates) return a `PendingAction` instead of executing. The UI shows a confirm card, and only on confirmation does the API execute the action through the domain. Every execution is written to the audit log. Low-risk housekeeping updates from the voice flow (room status, maintenance tasks) run automatically but are still logged.

## Consequences

- One extra click per mutation, in exchange for trust and an audit trail.
- The agent can propose several actions at once; the user approves each one.
