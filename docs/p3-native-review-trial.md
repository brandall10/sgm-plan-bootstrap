# W02 P3 native review trial

## Native receipt

- Environment: Codex desktop local task, built-in in-app Browser, 2026-09-13.
- Page: `http://127.0.0.1:4173/`, top document, viewport `993x1215`.
- Target: `question.wording — Choose the learner-facing unavailable wording`.
- Stable target selector: `article#item-question\.wording > h3 > a`.
- Browser marker position: `(354, 587)`.
- Actual user annotation received in the task:

  > Resolve this with: “This offline progress is unavailable. You can start over.” Use “unavailable” for the state label, and reserve “could not be restored” for a specific restore failure.

The annotation was received as a native Browser comment with the page URL,
frame, target, selector, position, and marker screenshot. This is the actual
host-receipt evidence; the stale-target checks below are automated simulations.

## Baseline and resolution

- Source snapshot: `5523e848d59bf984f12ab80f61b73cdeffdd329917aab50769a7e8cc65d01367` (revision 2, content `content-1d8329ead56663b8b792cdcb`).
- Illustrative record: `acceptance.w02-p3-illustrative`, explicitly synthetic, source `plan:w02-p3-t1`, actor `agent:status-next`.
- Refined draft: `1ec057b25952447cca896a5d7e6b8ecf2871d5a90dcf0081c0eaa691ec94681d` (revision 3, content `content-e8ea1ff1879f47588bbd712e`).
- Resolution: answered `question.wording`, added `decision.unavailable-wording`, revised `criterion.recovery-unavailable`, and updated the authoritative prototype HTML/CSS copy.
- `/api/compare` reports 5 material changes, 1 revision metadata change, and no unavailable inputs; both old/new links remain addressable.

The viewer was restarted after publication. The explicit old-snapshot route
reopened the original open question and original prototype bytes, while the
draft route showed the answered wording and revised prototype. The focused
snapshot-store regression also reopened retained repository-root bytes after
the temporary source file was removed.

## Stale-target and layout checks

- The existing removed-item browser scenario (`falls back to a surviving phase
  when a selected item is removed`) passed; this is simulated stale-target
  evidence, not a second native annotation.
- `npm run test:e2e` passed all 9 tests, including pinned comparison links,
  reconnect/restart behavior, sandbox isolation, and tablet/narrow layout.

## Five-run measurement

Environment: Node `v26.7.0`, Darwin `27.0.0` arm64, Apple M3 Max, Google
Chrome channel. Five ordinary sequential runs per category:

| Measurement | Range (ms) | Median (ms) |
| --- | ---: | ---: |
| Warm candidate load | 1.12–3.23 | 1.22 |
| Runtime open | 9.36–22.39 | 9.43 |
| Browser render | 96.23–310.74 | 105.77 |
| Text refresh | 83.45–261.21 | 172.02 |
| Asset refresh | 137.07–360.62 | 197.69 |

No repeatable delay approached the few-second investigation threshold.
