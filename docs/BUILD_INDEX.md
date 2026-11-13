# EasyLab Suite build checkpoints

> Latest development milestone: [EasyLab Next qPCR Analysis phase 1](#easylab-next-qpcr-analysis-phase-1-13-november-2026). The 0.2.1 and 0.2.0 entries below are historical installed-release records.

## EasyLab Next qPCR Analysis phase 1 (13 November 2026)

**qPCR source:** commit `4d76175dff4ca801551a2572e8439c20cb8a0fde` on `codex/easylab-next-20261113`, pushed to the Next branch. The Suite's qPCR source pin matches this commit, and strict module source preflight passed. **Suite checkpoint commit:** the commit containing this entry; use `git log -1 -- docs/BUILD_INDEX.md` to identify it.

**Status:** qPCR phase 1 is implemented and tested on the separate Next line. It includes the guided review workflow, biological-sample analysis engine, saved experiments, graphs, basic statistics and the accepted XLSX review export. The installed stable Suite 0.2.1 and original checkouts remain preserved. No Next package is built or installed; the qPCR preview server is closed.

The accepted review workbook was recalculated using a separate headless LibreOffice profile; all three printed pages were rendered and inspected after the final chart fix. Background browser checks used fictional practice data and were closed after review. The native Excel application was not used.

| Check | Result |
| --- | --- |
| qPCR Analysis pytest | 60 passed; 14 third-party Matplotlib/Pyparsing deprecation warnings |
| qPCR automated browser checks | 2 passed; isolated Next preview and fictional data; server closed |
| XLSX review workbook | Recalculated and all three printed pages inspected with headless LibreOffice |
| Suite runtime isolation tests | 12 passed |
| Suite module source/receipt tests | 5 passed |
| Suite Notebook route tests | 2 passed |
| Strict source preflight | Passed against the updated qPCR pin |
| Original-version preservation | All nine original heads/branches/status checks and five protected hashes matched |
| Suite production renderer build/lint | Passed, including the final browser-tab title correction |
| Suite Playwright browser tests | 12 passed under Node 24.22.1, isolated browser cache and strict port 18578 |
| Suite desktop/narrow screenshot inspection | Passed at desktop/narrow widths; Next title verified; no module app launched; server closed |
| Native Excel; packaged macOS/installed behavior; Windows | Unverified |
| Merge, stable installation or public release | Not performed |

Suite evidence: [Next launcher](../design-review/builds/next-qpcr-phase-1/launcher.png) and [review notes](../design-review/builds/next-qpcr-phase-1/README.md).

Review evidence and scope notes: [qPCR phase 1 README](https://github.com/meghamsh738/qPCR-analysis-app/blob/4d76175dff4ca801551a2572e8439c20cb8a0fde/design-review/next-qpcr-phase-1/README.md), [desktop workflow](https://github.com/meghamsh738/qPCR-analysis-app/blob/4d76175dff4ca801551a2572e8439c20cb8a0fde/design-review/next-qpcr-phase-1/qpcr-practice-desktop.png), and [narrow workflow](https://github.com/meghamsh738/qPCR-analysis-app/blob/4d76175dff4ca801551a2572e8439c20cb8a0fde/design-review/next-qpcr-phase-1/qpcr-practice-narrow.png). The screenshots use fictional data and are not evidence of a packaged or installed app.

## Integration preview 0.2.1

**Packaged source:** `61be06e`, merged with its review records into `main` at `99dfe75` · **Status:** merged and installed as 0.2.1 on 30 October 2026; Notebook authentication blocked.

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
| Installed macOS 0.2.1 | Passed: exact installed runtime/path, launcher, both primer choices, repeated-sample metadata/TSV, cDNA CSV/XLSX save/reopen and repeat-file protection, Notebook entry/browser route; no page errors |
| App integrity | Installed 0.2.1 and rollback 0.2.0 signatures valid after launch; all eight bundled module digests and 27 source/renderer files match the merged source |

Google rejected `http://127.0.0.1:8030` with **Error 400: origin_mismatch** on 30 October 2026. The existing authorized local origin is needed before continuing authentication checks. The failing request was not retried in the final run, and Google settings were not changed. This is a locally ad-hoc signed preview, not a notarized release. Windows packaging was not checked.

Screenshots and verification records from packaged source `61be06e` are in [`design-review/builds/integration-0.2.1`](../design-review/builds/integration-0.2.1/): [launcher](../design-review/builds/integration-0.2.1/launcher.png), [qPCR output](../design-review/builds/integration-0.2.1/qpcr-repeated-sample-output.png), [narrow qPCR table](../design-review/builds/integration-0.2.1/qpcr-repeated-sample-narrow.png), [cDNA result](../design-review/builds/integration-0.2.1/cdna-output.png), and [Notebook header](../design-review/builds/integration-0.2.1/notebook-header-narrow.png).

**Merge and installation:** User approval was followed by fast-forward merges into the three GitHub `main` branches: Suite `99dfe75`, qPCR `e200649`, cDNA `6c25e0b`. Reviewed code was retained unchanged. The exact checked app was installed at `/Users/meghamsh/Applications/Easylab Suite.app`; its ASAR SHA-256 is `44bc56775b2d553f2e857ecaaa4f2277f1d4d0696fe2ebafc7d7b51b8510767f`. The prior 0.2.0 app is preserved at `/Users/meghamsh/Documents/Codex/2026-09-30/i-wa/work/integration-2026-10-30/Archive/Easylab Suite-0.2.0-installed-rollback.app`; older rollback copies are untouched. Installed checks used separate test data and profile folders. No PR text or public release was published.

Installed-app screenshots and verification: [`design-review/builds/installed-0.2.1`](../design-review/builds/installed-0.2.1/).

## Lab Workspace 0.2.0

**Source:** `d2a02ec` on `codex/suite-ui-refresh` · **Status:** historical 0.2.0 checkpoint, superseded by installed 0.2.1; these UI changes are now merged into `main`.

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


## EasyLab Next — branch separation record (13 November 2026)

- Branch: `codex/easylab-next-20261113` in Suite and all eight module worktrees.
- Preserved baseline tag: `preserved/easylab-before-next-20261113`.
- This records the original branch/worktree setup; see the current phase-1 status at the top of this index.
- Original checkouts and the installed stable 0.2.1 remain preserved.
- Runtime paths, strict ports, approved future phases and remaining checks: [Next checkpoint](EASYLAB_NEXT.md).
