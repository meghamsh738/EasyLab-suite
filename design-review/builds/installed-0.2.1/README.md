# Installed EasyLab Suite 0.2.1

Installed and checked on 30 October 2026 after user-approved fast-forward merges into the Suite, qPCR and cDNA main branches. App: `/Users/meghamsh/Applications/Easylab Suite.app`. The exact previously checked package was installed; no app code changed during merging.

`launcher.png` and `qpcr-repeated-sample-output.png` were captured from the installed app with a separate test profile/data root and visually inspected. The runtime identity and functional results are in `verification.json`; package/source/module matching is in `artifact-verification.json`. `merge-install-state.json` records merge and rollback details at the installation milestone. File hashes are in `evidence-manifest.json`.

Installed smoke checks passed for launcher/navigation, 100 µM stock/10 µM working primers, repeated sample metadata/TSV, cDNA CSV/XLSX save/reopen with existing-file protection and Notebook entry/browser route. No page errors. Installed and rollback signatures remained valid after launch. The earlier 32 automated checks and all seven calculator workflows apply to the identical package.

Notebook authentication was not retried: the unchanged local URL is still rejected by Google with origin_mismatch. Signed-in Notebook editing/sync/export remain unverified. No account credentials or Drive writes were used. Local ad-hoc signing; Windows and notarization unverified.
