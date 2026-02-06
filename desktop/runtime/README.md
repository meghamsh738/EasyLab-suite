# Desktop Runtime (Offline Mode)

Easylab Suite can run fully offline, but some modules need a Python backend:

- FastAPI backends (cDNA, qPCR Planner, Animal Pairing, Breeding, Y-Maze)
- Streamlit server (qPCR Analysis)

To make the Windows installer **self-contained** (no separate Python install on the target PC),
we bundle a portable Python runtime into the Electron app at build time.

## What Gets Generated

This directory is expected to contain:

- `python/` (portable Python runtime + site-packages)
- `requirements-suite.txt` (combined dependency list used when building the runtime)

The `python/` folder is **generated** and ignored by git (except `.gitkeep`).

## Build (Windows)

Run this on the machine that builds the Windows installer:

```powershell
.\desktop\scripts\prepare-python-runtime.ps1
```

Then build the installer as usual:

```bash
npm install
npm --prefix web install
npm run build:electron
```

## Notes

- The runtime is placed into the packaged app under `resources/runtime/python/`.
- Electron will prefer this bundled Python automatically (and fall back to system Python if missing).
- Bundling Python + scientific packages increases installer size.
- Third-party components (Python + pip packages) carry their own licenses; keep them alongside the build artifacts when distributing.

