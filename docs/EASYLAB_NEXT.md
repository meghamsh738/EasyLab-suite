# EasyLab Next development checkpoint

Updated: 13 November 2026.

## Current state

The user authorized implementation after the separate-branch milestone. qPCR Analysis phase 1 is implemented and committed on the Next module branch as `4d76175dff4ca801551a2572e8439c20cb8a0fde`; that commit has been pushed, and the Suite source pin now matches it. The guided review workflow, biological-sample calculation engine, saved experiments, graphs, basic statistics and accepted XLSX review export are implemented.

The qPCR module's final Python test run passed **60 tests**, with **14 third-party Matplotlib/Pyparsing deprecation warnings**. Background browser checks used fictional practice data. The accepted review workbook was recalculated with a separate headless LibreOffice profile; all three printed pages were rendered and inspected after the final chart fix. The desktop and narrow-window review screenshots and verification notes are in the [qPCR phase-1 review record](https://github.com/meghamsh738/qPCR-analysis-app/blob/4d76175dff4ca801551a2572e8439c20cb8a0fde/design-review/next-qpcr-phase-1/README.md). The qPCR preview was closed after testing.

Suite runtime isolation, source-receipt, Notebook route and browser tests pass. The production renderer build and lint passed after the browser-tab title correction. The final desktop and narrow browser layouts passed visual inspection at 1400 × 900 and 768 × 900; the Next title and branding were visible, the Analysis filter showed two tools, there was no overflow, and no console errors or warnings appeared. The task-owned browser and server were stopped. No module was launched. No packaged desktop app has been built or installed. Native Excel, packaged macOS/installed-app behavior and Windows checks remain unverified. Suite launcher evidence is in [`design-review/builds/next-qpcr-phase-1`](../design-review/builds/next-qpcr-phase-1/README.md).

The original checkouts remain the stable versions. For the approved improvement work, the active Suite is `/Volumes/Coding Projects/Active/easylab-next/suite`; its ignored `.env.4tb` maps all eight modules to sibling Next worktrees. Do not use the old source directories for build or implementation. Each Next module has its own tracked AGENTS.md.

Baseline tag in every repository: `preserved/easylab-before-next-20261113`. The precise source map, original branches, hashes and protected-file checks are in `EASYLAB_NEXT_BASELINE.json`. Worktrees share Git history/object storage, but their files, indexes and checked-out branches are separate. A worktree is not an independent disk backup; the separate remote branch/tag refs preserve history on GitHub once pushed.

| Repository | Original branch (preserved) | Starting commit | Development worktree |
| --- | --- | --- | --- |
| suite | `main` | `e6246ba7` | `/Volumes/Coding Projects/Active/easylab-next/suite` |
| labnotebook | `codex/native-android-recovery` | `70dc8718` | `/Volumes/Coding Projects/Active/easylab-next/modules/labnotebook` |
| cdna | `main` | `6c25e0bc` | `/Volumes/Coding Projects/Active/easylab-next/modules/cdna` |
| qpcr-planner | `main` | `e200649a` | `/Volumes/Coding Projects/Active/easylab-next/modules/qpcr-planner` |
| qpcr-analysis | `master` | `f897b560` | `/Volumes/Coding Projects/Active/easylab-next/modules/qpcr-analysis` |
| elisa-analysis | `main` | `4c5cf24b` | `/Volumes/Coding Projects/Active/easylab-next/modules/elisa-analysis` |
| animal-pairing | `main` | `f119042c` | `/Volumes/Coding Projects/Active/easylab-next/modules/animal-pairing` |
| breeding | `main` | `bd27cca8` | `/Volumes/Coding Projects/Active/easylab-next/modules/breeding` |
| ymaze | `main` | `7f87274a` | `/Volumes/Coding Projects/Active/easylab-next/modules/ymaze` |

## Approved implementation sequence

1. qPCR Analysis — phase 1 complete in Next commit `4d76175dff4ca801551a2572e8439c20cb8a0fde`: guided review; sample/plate identities; biological rather than technical-well weighting; the user's 8-point 4-fold standard series as a named preset; side-by-side suitable standard-curve and DeltaDeltaCq methods; explicit exclusions/range review; sample-level graphs; basic two-group/one-way tests with adjusted P values; saved experiments and reviewed XLSX output.
2. ELISA: one-plate guided standard/blank/replicate review; prevent polynomial boundary clamping; consistent corrections/dilution; custom and legacy presets; graphs and exports.
3. cDNA and qPCR Planner: editable named recipes, kit constraints distinct from preferences, stock/working concentration handling, pipetting feasibility, overage, 96/384-well planning and analysis handoff.
4. Animal tools: configurable balance goals and strict constraints; seeded reproducible grouping/pairing, locks, explanatory breeding candidates with unknown genotype retained, reproducible Y-maze schedules and exports.
5. Notebook and Suite: local-only durable notebook without Google login, safe explicit copies of cached notebooks, backups/attachments/result links, common navigation/imports/graphs/local experiment packages.

Audience: user and similar-lab researchers. Keep current architecture/local processing, originals and existing apps. New experiments carry presets/display choices but require experimental mappings, references, calibrators and review decisions to be confirmed. Use sample dots/mean lines, optional error bars; changing linear/log display does not change statistics. No new cloud/mobile scope. No merge, installed-app replacement, publishing or outreach is authorized.

## Runtime isolation

The default Next runtime root is `/Volumes/Coding Projects/Active/easylab-next/runtime`. The qPCR standalone launcher uses strict loopback port 18501 and its own data, settings and exports under this root; it refuses an existing listener. Suite runtime paths separate Electron `userData` and `sessionData`, module data/settings/attachments/exports, Python environments and caches. The Suite package identity is `Easylab Suite Next (Dev)`, version `0.3.0-dev.1`; it has not been packaged or installed.

| App | Strict loopback port |
| --- | ---: |
| Suite launcher | 18578 |
| Lab Notebook | 18530 |
| cDNA Calculator | 18511 |
| qPCR Planner | 18512 |
| qPCR Analysis | 18501 |
| ELISA Analysis | bundled static page; no listener |
| Animal Pairing | 18521 |
| Breeding Pair Selector | 18522 |
| Y-Maze Randomizer | 18523 |

No native app was launched, no real user data or session was copied, and no preview server remains running. Preservation verification passed: all nine original repositories retained their recorded HEADs, branches and clean statuses; all five protected installed/configuration-file hashes matched.

## Verification and next action

| Check | Result |
| --- | --- |
| qPCR Analysis pytest | 60 passed; 14 third-party Matplotlib/Pyparsing deprecation warnings |
| qPCR background browser review | Passed with fictional practice data; qPCR preview server closed |
| Accepted XLSX review workbook | Recalculated with isolated headless LibreOffice; all three printed pages rendered and inspected |
| Suite runtime isolation tests | 12 passed |
| Suite module source/receipt tests | 5 passed |
| Suite Notebook route tests | 2 passed |
| Suite production renderer build and lint | Passed after the browser-tab title correction |
| Suite Playwright browser tests | 12 passed under Node 24.22.1, isolated browser cache and strict port 18578 |
| Suite desktop/narrow screenshot inspection | Passed at 1400 × 900 and 768 × 900; correct Next title/branding, two Analysis tools, no overflow or console errors/warnings |
| Strict Suite module source preflight | Passed after pinning qPCR to `4d76175dff4ca801551a2572e8439c20cb8a0fde` |
| Original-version preservation | All nine original HEAD/branch/status checks and five protected hashes matched |
| Native Excel; packaged macOS/installed app; Windows | Not checked |
| Next package and installation | Not built or installed |

Module artifact sync and packaged-app checks remain unverified.

Next concrete action: finalize the Suite checkpoint commit and record its source/preflight state. Suite checkpoint commit: the commit containing this checkpoint; see `git log -1 -- docs/EASYLAB_NEXT.md`. Do not merge into stable branches, install a Next package or publish a release as part of this checkpoint. The approved later phases and full acceptance examples are in Codex chat `01a1d572-e4c8-7563-a17a-23876692ed82`, “Plan EasyLab Suite improvements”.
