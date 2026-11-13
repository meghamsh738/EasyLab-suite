# EasyLab Next development checkpoint

Updated: 13 November 2026.

## Current state

The user approved the full improvement plan, then required all development to be separated before implementation. That separation milestone is complete: nine Git worktrees use `codex/easylab-next-20261113`, each rooted at its preserved current revision. Only development-boundary documentation and Suite source pins have changed. No scientific/application feature code, installed app, source data, or existing app profile was changed.

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

1. qPCR Analysis: guided review; sample/plate identities; biological rather than technical-well weighting; the user's 8-point 4-fold standard series as a named preset; side-by-side suitable standard-curve and DeltaDeltaCq methods; explicit exclusions/range review; sample-level graphs; basic two-group/one-way tests with adjusted P values; saved experiments.
2. ELISA: one-plate guided standard/blank/replicate review; prevent polynomial boundary clamping; consistent corrections/dilution; custom and legacy presets; graphs and exports.
3. cDNA and qPCR Planner: editable named recipes, kit constraints distinct from preferences, stock/working concentration handling, pipetting feasibility, overage, 96/384-well planning and analysis handoff.
4. Animal tools: configurable balance goals and strict constraints; seeded reproducible grouping/pairing, locks, explanatory breeding candidates with unknown genotype retained, reproducible Y-maze schedules and exports.
5. Notebook and Suite: local-only durable notebook without Google login, safe explicit copies of cached notebooks, backups/attachments/result links, common navigation/imports/graphs/local experiment packages.

Audience: user and similar-lab researchers. Keep current architecture/local processing, originals and existing apps. New experiments carry presets/display choices but require experimental mappings, references, calibrators and review decisions to be confirmed. Use sample dots/mean lines, optional error bars; changing linear/log display does not change statistics. No new cloud/mobile scope. No merge, installed-app replacement, publishing or outreach is authorized.

## Runtime isolation required before the first preview

No Next app/server was launched in this milestone. The current source defaults still share ports/settings with the stable version; code isolation is complete but runtime isolation is not yet implemented or certified. Before a preview:

- Give Next a separate Electron userData/profile and packaging identity/name. Keep all module data, attachments, exports, settings, writable Python environments and generated builds inside Next-specific locations. Do not copy existing user sessions.
- Set a Next-specific EASYLAB_DATA_ROOT. qPCR Analysis separately writes under Documents/Easylab and .easylab in the user's home; change it to honor explicit isolated paths before use. Do not repurpose HOME.
- Allocate explicit, distinct strict ports for the launcher and every ported module. Stable defaults are 5178, 8030, 8011, 8012, 8501, 8021, 8022 and 8023. Existing launch code accepts any open listener; reject unowned listeners instead. Keep Notebook state/attachment APIs off stable 8030.
- Generate apps/ and .suite-dist/ only in the Next Suite, using its .env.4tb. Do not inherit APP_DIST_DIR pointing elsewhere or share writable dependencies/build directories.
- Inspect synthetic workflows through a background browser. Native UI still needs a safe time from the user unless they ask to operate it immediately.

## Verification and next action

Run `node --env-file=.env.4tb scripts/preflight-modules.mjs --strict` from this Suite. It must resolve every module inside the Next root and match committed module pins. Artifact checks are deferred until branch-local apps have actually been built.

The isolation verifier checks all original heads/branches/clean states, baseline tags, new branch ancestry, allowed documentation-only changes, distinct file inodes and protected installed/configuration file hashes. GitHub branches/tags and final verification status are recorded in the task handoff and Obsidian EasyLab Suite progress note.

Next concrete action: implement and test the runtime boundary in the Next branch before starting the qPCR preview, then continue phase 1. The full agreed behaviour and acceptance examples are in Codex chat `01a1d572-e4c8-7563-a17a-23876692ed82`, “Plan EasyLab Suite improvements”.
