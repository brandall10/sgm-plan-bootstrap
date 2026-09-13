# P2 native presentation and annotation probe

This record describes an observed host-capability check, not a substitute for a
user instruction or an acceptance record.

## Environment and mechanism

- Environment: Codex desktop local task on 2026-09-13.
- Content presented: the loopback `offline-recovery` viewer, including the
  revision/content-ID header, the `criterion.restore-choice` deep link, the
  explanatory diagram, and the sandboxed recovery mock.
- Host mechanism attempted: the Codex in-app browser rendered the local viewer;
  an `open_in_codex` browser-panel request was also issued for the same visible
  criterion/design route.

## Observed outcome

The in-app browser displayed the package correctly, but the available host
surface exposed no native annotation action, feedback callback, or annotation
payload to the agent. The browser-panel request remained queued by the host,
and no human annotation event was supplied during this phase. Consequently,
there is no item/revision-attributed feedback receipt to map into a package edit.

**Result: native annotation is unavailable or unverified in this environment.**
This is not reported as a successful annotation trial. The browser viewer remains
usable through its ordinary saved-content path and manual reload. No custom
feedback server, chat pane, polling hook, or agent-session registry was added.

## Follow-up boundary

If a later environment exposes an actual native annotation control and receipt,
repeat this probe against a visible stable item and record its attribution fields
before claiming supported host feedback. Live refresh remains P3 scope.
