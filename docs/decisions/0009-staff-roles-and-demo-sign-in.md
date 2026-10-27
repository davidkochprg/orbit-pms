# 9. Staff roles and demo sign-in

## Context

A hotel has managers, receptionists and housekeepers, and only some of them should change settings or the team. Real authentication (passwords, sessions, invites) is out of scope for the hackathon, and the public demo must open without credentials.

## Decision

Staff members are records with a role (`manager`, `receptionist`, `housekeeping`) and an `active` flag. Signing in means picking an active staff member: the welcome page's "Enter demo" picks the first active manager, and the user menu switches to anyone else. The web app stores the ID in the browser and sends it as `x-staff-id`. The domain checks permissions: only an active manager may change the hotel profile or the team, and the team always keeps at least one active manager. Settings and team changes record who made them in the audit payload.

## Consequences

- Roles and permissions are real and tested in the domain; identity is not. Anyone can claim any staff ID, so this is not a security boundary. Real sign-in would replace how the ID is obtained, not the permission checks.
- Inactive members can no longer sign in but keep their history.
- Booking, inbox and housekeeping actions do not check roles yet, and their audit entries record `user` or `agent`, not which staff member.
