# Marion HQ for macOS

A native Mac app for Marion HQ with an **Update** button that pulls the latest
version and restarts the app.

## Install

1. Open the latest release: <https://github.com/henlyfilms/Videogame/releases/latest>
2. Download **Marion-HQ.dmg**, open it, and drag **Marion HQ** into **Applications**.
3. First launch only: the app isn't notarized by Apple, so macOS will block it once.
   Open **System Settings → Privacy & Security**, scroll down, click **Open Anyway** next to Marion HQ, then confirm.
   (Terminal alternative: `xattr -cr "/Applications/Marion HQ.app"`.)

## Updating

- Click **Update** (download icon, top-right of the HQ). When a new build is out the
  button turns blue with a dot (the app checks quietly every 30 minutes).
- **Update & Restart** downloads the new build, checks its SHA-256, installs it and
  relaunches Marion HQ on the new version. Your settings (theme, speed, etc.) are kept.
- **Restart** pulls any update and relaunches, or just restarts if you're current.
- The same flow is in the menu bar: **Marion HQ → Check for Updates…**.
  **View → Restart Marion HQ** (⇧⌘R) restarts; **View → Reload** (⌘R) refreshes the page.

Safety nets:
- If a new build fails to render within a few seconds of launch, the app rolls back to the
  previous version automatically and never offers that build again.
- **Help → Reset to Built-in Version…** removes downloaded updates.

## How it works

The `.app` is a small Electron shell that rarely changes. The game itself (the Vite
build) is a *web bundle* the shell serves from disk at a private `app://hq/` origin.

| | |
| --- | --- |
| `main.cjs` | Window, menu, `app://` protocol, update IPC, post-update health check |
| `preload.cjs` | Exposes `window.marionDesktop` to the game (the game hides the Update button when it's absent) |
| `updater.cjs` | Check GitHub Releases → download → verify → unpack → activate → rollback (pure Node, unit-tested) |
| `../src/ui/UpdateButton.tsx` | The top-bar button and popover |
| `../.github/workflows/mac-app.yml` | CI build and release |

Publishing an update needs no manual steps. Every push to the repo's **default
branch** runs the *Mac app* workflow on a macOS runner, which:

1. tests and builds the game,
2. stamps it `build-<run number>` and zips it (`marion-hq-web.zip` + `manifest.json` with its SHA-256),
3. builds a universal (Apple Silicon + Intel), ad-hoc-signed `Marion-HQ.dmg`/`.zip`,
4. publishes all of them as GitHub Release `build-<n>`.

Pushes to other branches build the app too, but only attach it to the workflow run
(Actions → run → *Artifacts*) and don't publish an update.

Installed apps see the new release the next time they check. Changes to the shell
itself (`desktop/*.cjs`) can't hot-swap: bump `version` in `desktop/package.json` and the
app will tell users to download the new `.dmg`.

## Local development

```bash
npm run build                # in the repo root
cd desktop
npm install
npm run stage                # copy ../dist → web/ (build 0 = "local")
npm start                    # run the app
npm test                     # updater tests
npm run dist:mac             # build release/Marion-HQ.dmg (on a Mac)
```

`MARION_UPDATE_API=http://localhost:1234` points the updater at a fake GitHub API for testing.
