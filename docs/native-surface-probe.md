# P2 native presentation and annotation probe

This record describes the actual host interaction and the resulting package
edit. It supersedes the earlier inconclusive panel-only attempt.

## Initial attempt

The first check opened the loopback viewer and queued an `open_in_codex`
browser-panel request, but no human annotation was made and no receipt reached
the task. That attempt was insufficient evidence of host availability and is not
used as the final outcome.

## Verified environment and mechanism

- Environment: Codex desktop local task on 2026-09-13.
- Host mechanism: the built-in Codex in-app Browser with Annotation mode.
- Initial content presented: the `offline-recovery` viewer at
  `#/packages/offline-recovery/items/phase.recovery-experience`, showing author
  revision `1` and content ID `content-849285f380ec32ad523d7d41`.
- Stable item selected: `criterion.restore-choice`, whose visible text was
  `A recoverable snapshot offers restore and identifies the progress that will return.`

## Actual annotation receipt

The user saved this annotation on the criterion text:

> Change this to: "A recoverable snapshot clearly identifies the exact progress that Restore will return"

The Browser comment reached the task with attribution evidence:

- page URL and top-document frame;
- target text and selector `li#item-criterion\\.restore-choice > p`;
- target path `section > ol > li > p`;
- viewport node position `(720, 595)` in `1089x1215`;
- nearby text, comment text, and a saved marker screenshot.

The `item-criterion.restore-choice` target is therefore mappable to the stable
package item and the displayed revision.

## Authoritative edit and reload

The exact requested text was written to `examples/offline-recovery/plan.json`
and published through the repository's atomic publication helper:

```text
npm run publish -- --package examples/offline-recovery
Published .../examples/offline-recovery/plan.json at author revision 2 (content-1d8329ead56663b8b792cdcb).
```

The viewer's **Reload package** control then loaded revision `2`, displayed
content ID `content-1d8329ead56663b8b792cdcb`, and the stable
`criterion.restore-choice` route rendered:

> A recoverable snapshot clearly identifies the exact progress that Restore will return

## Result

**Native Browser annotation receipt and the annotation-to-authoritative-edit/
manual-reload loop are verified in this Codex desktop environment.** The result
does not claim that arbitrary hosts or other Codex surfaces expose the same
capability. No custom feedback server, chat pane, polling hook, or agent-session
registry was added. Automatic watching and reconnect behavior remain P3 scope.
