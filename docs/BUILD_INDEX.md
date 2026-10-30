# EasyLab Suite build checkpoints

## Integration preview 0.2.1

**Packaged source:** `61be06e` on `codex/suite-integration-0.2.1` · **Status:** calculator checks complete; Notebook authentication blocked; unmerged, not installed.

This candidate combines the eight-module UI with pinned module sources, repeated-sample numbering in qPCR output and TSV, and the cDNA example-loader fix. qPCR keeps **100 µM stock** and **10 µM working solution** choices. Notebook has an **Open in browser** action. The preview uses separate local data and profile folders; its Electron downloads stay in those scratch export folders. The qPCR Empty legend now remains compact.

| Check | Result |
| --- | --- |
| Automated checks | 32 distinct checks: 12 Suite browser, 11 qPCR API/browser, 5 source-receipt, 2 Notebook route, 2 cDNA regression |
| Builds and lint | Suite renderer and qPCR passed; all eight pinned module builds and strict artifact preflight passed |
| Packaged arm64 workflows | Seven calculation modules passed; qPCR primer choices, repeated labels, metadata and copied Sample # values checked |
| cDNA files | Two separate CSV exports and one XLSX saved and reopened from scratch folders; repeated exports preserved existing files |
| Narrow layouts | qPCR output and Notebook header checked at 780 px; no page overflow, Sample # and browser action visible |
| Notebook | Entry screen, owned browser route and normal-browser entry passed; signed-in editing, sync and export remain unverified |
| Independent review | Preview-download isolation finding fixed in `837dd83` and rechecked |
| App integrity | Candidate and installed app signatures valid after native QA; installed version remains 0.2.0 |

Google rejected `http://127.0.0.1:8030` with **Error 400: origin_mismatch** on 30 October 2026. The existing authorized local origin is needed before continuing authentication checks. The failing request was not retried in the final run, and Google settings were not changed. This is a locally ad-hoc signed preview, not a notarized release. Windows packaging was not checked.

Screenshots and verification records from packaged source `61be06e` are in [`design-review/builds/integration-0.2.1`](../design-review/builds/integration-0.2.1/): [launcher](../design-review/builds/integration-0.2.1/launcher.png), [qPCR output](../design-review/builds/integration-0.2.1/qpcr-repeated-sample-output.png), [narrow qPCR table](../design-review/builds/integration-0.2.1/qpcr-repeated-sample-narrow.png), [cDNA result](../design-review/builds/integration-0.2.1/cdna-output.png), and [Notebook header](../design-review/builds/integration-0.2.1/notebook-header-narrow.png).

**Recovery:** Suite `codex/suite-integration-0.2.1` at `61be06e`; qPCR `codex/qpcr-integration-0.2.1` at `e200649`; cDNA `codex/fix-example-samples` at `6c25e0b`. Branches are pushed for review. The installed 0.2.0 app and older rollback copies are preserved. No merge, PR publication or release publication was performed.

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
