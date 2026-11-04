# Neural

Control your Mac with your Meta Neural Band. Turn finger gestures, holds, and wrist movements into keyboard shortcuts, app actions, and gesture combos.

![Neural desktop app](docs/desktop-demo.png)

## Download and install

**[Download Neural for Mac](https://github.com/Ben-Santana/neural/releases/latest)** · [All releases](https://github.com/Ben-Santana/neural/releases)

Neural requires an **Apple Silicon Mac, macOS 13 or later**, and a compatible Meta Neural Band. Intel Macs and other operating systems are not supported. Python and the Bluetooth dependencies are included in the app.

1. Download the `.dmg` from the latest release's **Assets** section.
2. Open it and drag **Neural** into **Applications**.
3. Launch Neural from Applications. Current builds are ad-hoc signed and aren't notarized by Apple. If macOS blocks opening the app, go to **System Settings → Privacy & Security → Open Anyway**.
4. Allow **Bluetooth** access when prompted. To send shortcuts or control the pointer, enable Neural in **System Settings → Privacy & Security → Accessibility**. You can open these settings from Device settings in the app.

Neural is an early release. Band firmware compatibility and gesture recognition still need broader hardware testing. Start with a few simple assignments and try them in an app where you can see their effect.

## Connect your band

1. Put your band into pairing mode, then choose **Connect band → Scan for bands**.
2. Select your band. If you've used it with Neural before, choose **Connect with saved identity**.
3. For first-time setup, expand **First time with this band?** and follow Meta sign-in to enroll it. Enrollment changes the band's saved identity and can invalidate another app's access.
4. Try an index or middle-finger tap to confirm gestures are arriving.

On startup, Neural scans once and connects automatically when it finds a single band with a saved identity. If it finds several bands, choose one from the picker.

You can also choose **Explore demo** to look around without a band. Demo mode previews simulated data and doesn't send keyboard or mouse actions.

## Make it yours

- **Shortcuts and actions.** Click an assignment's keycap, hold a keyboard combination, and release to save it. You can also choose macOS actions, type text, call an API, or build an action sequence.
- **Gesture combos.** Combine gestures into a sequence to give the same fingers more jobs. Enable or disable individual assignments as you go.
- **Profiles.** Keep different assignments for different workflows, share assignments across profiles, and switch profiles from the app or a gesture.
- **Hold to adjust.** Assign a hold to a pair of actions, then rotate or move your wrist to repeat either direction. Release the hold to stop.
- **Pointer and radial menus.** Configure wrist-driven pointer movement or a radial menu for quick access to actions.
- **Cheat sheets.** Keep a profile's assignments visible while learning them.
- **Air gestures.** Add a drawn shape after a finger gesture in a combo. The finger gesture starts recording; perform the shape within its configured time window. These matches are experimental and work best with your elbow still and forearm pointing forward.

Assignments are saved locally. Shortcuts pause while editing, in Device settings, and in Device test. Accessibility permission is required for native input delivery to the foreground app.

## Inspect and troubleshoot

Open **Device settings → Open device test** to view live EMG signals, wrist orientation, and the event and gesture inspectors. Snapshots export the bounded display history, rather than an entire recording session.

- **No band found:** check pairing mode, Bluetooth permission, and whether another app is connected.
- **Connected but no gestures:** check band fit, try index or middle taps, then reconnect. Sensor traffic alone doesn't mean gesture recognition is working.
- **Shortcuts don't run:** check Accessibility permission, that the assignment is enabled, and that you're outside the editor and device test views.
- **Saved identity rejected:** use **Device settings → Sign in with Meta again**. Re-enrollment can affect other apps using the same band.

[Report a problem](https://github.com/Ben-Santana/neural/issues) with your macOS version, Mac model, app release, and steps to reproduce it. Don't include passwords, tokens, or private sensor captures.

## Privacy and experimental features

Band data is processed locally. Meta sign-in requires a network connection. API-call actions send requests to the endpoints you configure. Optional research models download only when you choose to install them.

Saving a Meta password is optional and off by default. If enabled, credentials are stored in macOS Keychain, separately from your band identity. Use **Forget Meta password** in Device settings to remove them.

Device test includes experimental air gesture, native handwriting, and research hand-pose/handwriting tools. Firmware support varies; native handwriting is refused on unsupported firmware. The research checkpoints were trained for sixteen EMG channels while this band exposes eight, so their outputs aren't validated for controlling other apps. Optional research checkpoints have noncommercial licenses and may require macOS 14 or later.

See the [technical and experiment guide](docs/technical-guide.md) for compatibility limits, model licenses, sensor formats, recovery behavior, and detailed verification notes.

## Develop

Install Node.js 22, Python 3.12, and Google Chrome (used to generate the app icon). For a distributable Python runtime, use [uv](https://docs.astral.sh/uv/).

```sh
npm ci
uv python install 3.12
uv venv --python 3.12 --managed-python .venv
uv pip install --python .venv/bin/python -r python/requirements.txt
npm run desktop
```

`npm run dev` starts a browser demo at `http://127.0.0.1:5190`; Bluetooth requires Electron. `BAND_PYTHON` overrides the development Python executable.

```sh
npm run build
npm run test:python
npm run test:air:math
npm run package:mac
```

The package command creates `release/Neural-<version>-arm64.dmg` with a bundled Python runtime. Build on an Apple Silicon Mac. Browser smoke scripts and hardware-specific checks are documented in the [technical guide](docs/technical-guide.md).

## Automatic releases

Every push to `main` runs the [macOS release workflow](.github/workflows/release-macos.yml): it installs dependencies, builds the app, runs Python and air-gesture math tests, packages and checks the bundled runtime, and publishes the DMG plus a SHA-256 checksum to GitHub Releases. Failed checks prevent publication.

Each release has a unique tag such as `v0.1.0-build.12` and keeps its own download. The most recently published release is available through the Download link above. The same files are also retained as workflow artifacts for 30 days. Use the workflow's **Run workflow** button on `main` to rebuild manually. Re-running a completed run replaces that run's release assets.

These are automatically published early builds, not Apple-notarized releases. No signing secrets are required for the current ad-hoc builds. Installing a newer version is manual: download its DMG, quit Neural, and replace the app in Applications.
