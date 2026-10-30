# Neural — Band Studio

A local Electron instrument for Meta Neural Band data. React + TypeScript + Tailwind,
with an isolated Python bridge using `meta-neural-py==0.1.0a1`.

## Run

```sh
npm install
python3.12 -m venv .venv
.venv/bin/python -m pip install -r python/requirements.txt
npm run desktop
```

Or create the Python environment with `uv venv --python 3.12 .venv` and
`uv pip install --python .venv/bin/python -r python/requirements.txt`.
The environment and dependencies are already installed in this workspace.
Set `BAND_PYTHON` to override the Python executable.

`npm run dev` opens the browser preview at http://127.0.0.1:5190. Use **Explore demo**
to inspect simulated streams. Bluetooth requires the Electron app.
`npm run build && npm start` runs the compiled production interface in Electron.
Run `npm run package:mac` on Apple Silicon to create `release/Neural-0.1.0-arm64.dmg`.
The app bundles Python and its dependencies. Drag Neural to Applications. This local
build is ad-hoc signed and is not notarized; if blocked, allow it in System Settings
→ Privacy & Security → Open Anyway. Requires macOS 12 or later on Apple Silicon.

## Connect

1. Put the band into pairing mode and choose **Connect band → Scan for bands**.
2. Select the intended device. Use **Connect with saved identity** if already enrolled.
3. For a new identity, expand **First time with this band?** and explicitly enroll.
   Enrollment opens Meta sign-in and changes ownership. The optional missing-key
   compatibility checkbox defaults off; sessions using it show unverified proof.
4. macOS may request Bluetooth access. Live transport requires macOS and compatible
   hardware. The package is experimental and its hardware validation is limited.

## Data

- Eight unsigned 16-bit ADC EMG channels: 2,048 samples/s, 16 samples/batch.
- Gyroscope values in wire units; orientation in wire order w,x,y,z. Axes and
  physical unit conversion are uncalibrated. The right-hand visual applies normalized w,x,y,z quaternions directly around the wrist, with +X toward the fingers, +Y toward the thumb and +Z toward the back of the hand. Hold the hand flat with fingers forward and use Center hand to set a neutral wrist frame; subsequent rotations use inverse(neutral) × current, then map sensor Y to hand X and sensor X to hand −Y, preserving yaw about Z. Physical sensor mounting axes still require hardware verification. Motion uses visual traces without numerical readouts.
- Gestures preserve raw enum codes, derived actions, and synthetic flags.
- Device info, battery, hand, band-proof status, discontinuities, queue counters.
- Event inspector keeps the latest 100 packets; charts keep 2,048 samples/channel.
  Pausing freezes the display only; acquisition continues.
- JSON snapshots export the current bounded display history, not a full session.
- Host monotonic timestamps and distinct device clock domains remain separate.
  Queue drops are local; device packet-loss measurement is not validated.

## Checks

```sh
npm run build
.venv/bin/python -m unittest discover -s tests
```

The Python tests use real package model types and verify serialization
and cancellation cleanup without touching Bluetooth or enrollment.

## Design

White ground, ink traces, locally bundled Geist, quiet outlines and an interactive
isometric electrode figure. `band.js` is the figure source; `public/hairline/kernel.js`
is the unchanged Hairline kernel. `hairline-band.html` is a standalone bench with
intensity, theme and tour controls. The app mounts the same figure in a compact host.
See `docs/design.md` for the composition and data decisions.

Browser smoke check (with Google Chrome installed and the dev server running):
`npm run test:ui`. Set `TEST_ELECTRON=1` to also check production Electron startup,
sandboxed preload and Python bridge readiness; build first. `CHROME_PATH` can override
Chrome's location and `PREVIEW_URL` can override the default local preview URL.

Design workflows used: Taste, Hairline, and the installed MotionSites Web Builder skill.
MotionSites is now installed for future Codex turns as well.

The dedicated **Gesture inspector** retains the latest 200 gesture events independently
of the general sensor buffer, with finger/action filters, a finger highlight, and full packet details.

Gesture rows now distinguish **Raw gesture**, **Derived interaction**, and **Both layers**.
A derived-only packet uses its derived label instead of displaying its raw `unknown` field.
Press → button down → hold recognized and release → button up → hold ended are separate
stages; a directional gesture can also have a derived direction event. Each selected event
explains its role, and the Layer filter isolates raw or derived packets. Original fields,
codes, timestamps, and synthetic flags remain unchanged.

### Motion shortcuts (macOS)

The home screen assigns six motions to keyboard shortcuts. Click a keycap and press a keyboard combination to assign it inline. Hold the keys together; the full combination saves when you release them and enables the motion. Escape or clicking outside cancels; × clears an assignment. Each row has an independent toggle. Assignments are saved locally and start empty.

In the desktop app, enable Accessibility in **Device settings → Open Accessibility settings**, then connect your band. The native Python helper sends the assigned key combination to the foreground app. Shortcuts pause while editing, in Device settings, and in Device test. Demo mode only previews data and never sends keyboard events.

**Device test** is at the bottom of Device settings and contains Live signals, Event inspector, and Gesture inspector.

Tap and rotate means an index tap followed within 650ms by a wrist orientation change of more than 25 degrees. Index taps wait through that window when rotation is enabled (300ms otherwise) so a double tap or rotation can replace the single tap. Raw and derived gesture layers are coalesced to avoid duplicate actions. The current key map uses macOS ANSI virtual key positions; other keyboard layouts need device validation.

Verification: `npm run build`, `npm run test:python`, `npm run test:ui`, and `node scripts/motions-smoke.mjs`.

On desktop startup, Neural scans for nearby bands once. A single discovered band connects automatically using its saved identity; multiple bands open the connection picker. No bands leaves the app disconnected. Explicit manual connection, disconnect, or demo actions cancel pending startup auto-connection.

### Meta sign-in recovery

A rejected saved identity, missing enrollment, or startup timeout specifically in the
trust stage automatically opens Meta sign-in once per connection attempt. Successful
enrollment reconnects immediately; a second failure stays visible instead of looping.
Other Bluetooth and protocol failures do not automatically change enrollment.

Use **Device settings → Sign in with Meta again**, or the same action under the
connection dialog's **More options**, to enroll again manually. The dialog provides
**Cancel Meta sign-in** while enrollment runs. Re-enrollment can invalidate another
app's saved band identity. Recovery preserves the existing missing-band-key policy.

After 30 seconds of sensor traffic with no gestures in a new session, Neural offers
Meta sign-in recovery. Silence alone never starts enrollment; receiving a gesture
removes the notice. The action remains available in Device settings if gestures stop
later. Test the recovery interface with `node scripts/recovery-smoke.mjs` while the
local preview server is running.
