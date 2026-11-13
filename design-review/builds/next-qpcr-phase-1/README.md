# EasyLab Next phase-1 Suite launcher

13 November 2026. This image accompanies the runtime isolation and qPCR phase-1 source pin in the commit containing this folder. It shows the Next launcher at 1400 × 900 from this worktree, using strict port 18578 and a separate headless Chromium context.

All 12 Suite browser tests passed with mocked module launches. Desktop and 768 × 900 layouts were visually inspected; Next browser title and visible branding, Analysis filter and no horizontal overflow were checked. The final browser session reported no console errors or warnings. No native app or other module was launched, and task-owned browser/server processes were stopped afterward.

The Suite web build and lint passed. This evidence covers the browser launcher, not a packaged or installed Suite. qPCR workflow evidence belongs to pinned module commit `4d76175dff4ca801551a2572e8439c20cb8a0fde` in its own `design-review/next-qpcr-phase-1/` directory.
