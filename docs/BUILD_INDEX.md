# EasyLab Suite build checkpoints

## Lab Workspace 0.2.0

**Source:** `d2a02ec` on `codex/suite-ui-refresh` · **Status:** review-ready, unmerged.

The launcher now has a compact tool library, category filters and search. All eight modules share a consistent visual theme and navigation bar. Tool switching warns after edits or calculations, and keyboard focus, failed launches and narrow windows have been checked.

The qPCR Planner retains explicit **100 µM stock** and **10 µM working solution** choices. A separate cDNA example-data bug was fixed in `cdna-calculations` commit `6c25e0b` on `codex/fix-example-samples`: sample names beginning with “Sample” are no longer discarded as headers. The bundled cDNA backend matches that source.

### Validation

| Check | Result |
| --- | --- |
| Renderer build and lint | Passed |
| Browser interaction tests | 10 passed, installed Chrome channel |
| Module source/artifact preflight | Passed with `.env.4tb`, `--strict --require-artifacts` |
| cDNA example-data regression tests | 2 passed |
| Native example workflows | qPCR Planner, cDNA, animal grouping/pairing, breeding, Y-maze, ELISA and qPCR Analysis passed without page errors |
| Desktop and narrow layouts | All eight module entry screens checked at 1480 px and 780 px; no page-level horizontal overflow |
| Launcher at 390 px | Layout, search, actions and modal checked |
| Plate colours and labels | Module-defined colours preserved; black/white text verified on light/dark wells after reassignment |
| Independent review | Home-navigation promise finding fixed in `e0ddffc`; reviewer confirmed resolution |
| Installed macOS 0.2.0 | Passed: packaged runtime/version, isolated profile, launcher, home navigation, both primer sources and cDNA example calculation; signature remains valid after launch |

Notebook verification covers its sign-in screen and Suite navigation. Its existing embedded-browser Google sign-in restriction prevented signed-in editor and sync checks. Export controls and calculation results were checked; exported-file save/reopen workflows and Windows packaging were not tested in this checkpoint. The macOS build is locally ad-hoc signed, not a notarized public release.

### Screenshots

Screenshots are kept under [`design-review/builds/lab-workspace-0.2.0`](../design-review/builds/lab-workspace-0.2.0/).

- [Installed tool library](../design-review/builds/lab-workspace-0.2.0/launcher.png)
- [qPCR Planner](../design-review/builds/lab-workspace-0.2.0/qpcr-planner.png)
- [cDNA results](../design-review/builds/lab-workspace-0.2.0/cdna-output.png)
- [ELISA plate with readable labels](../design-review/builds/lab-workspace-0.2.0/elisa-layout.png)
- [qPCR Analysis at a narrow window size](../design-review/builds/lab-workspace-0.2.0/qpcr-analysis-narrow.png)
- [Mobile-width library preview](../design-review/builds/lab-workspace-0.2.0/launcher-mobile.png)

### Recovery

Use branch `codex/suite-ui-refresh`, source commit `d2a02ec`, to recover this build. The preceding installed version, 0.1.19, is retained locally for rollback. The source history separates the shared UI (`01a86d4`), home-navigation fix (`e0ddffc`) and plate contrast fix (`d2a02ec`) so individual changes can be reused later.
