# Lab 10 — Novel Interaction with Visualizations

Extends the **existing Lab 7 temporal commercial network** with real, browser-based MediaPipe hand tracking. Lab 7 and its original data are unchanged. There is no speech recognition.

## Run locally

From the STATS401 repository root:

```sh
python3 -m http.server 8010 --bind 127.0.0.1
```

Open http://localhost:8010/lab10/ in current desktop Chrome or Edge. Use localhost or HTTPS; opening `index.html` with `file://` cannot reliably load CSVs, modules, workers, or request camera permissions. Camera controls require Worker, createImageBitmap, WebAssembly, video capture, and a functioning MediaPipe runtime. Other browsers should retain normal controls even if tracking is unavailable; Safari and Firefox webcam tracking remain unverified.

The course homepage now includes a local Lab 10 navigation link and summary. No build or npm installation is needed to use the visualization. Internet access is required only for the optional MediaPipe camera feature. D3, the CSVs, and conventional controls load locally.

## Use

1. Use the ordinary timeline, Play/Pause, Reset, hover, and drag controls at any time. Click a company, or focus it and press Enter/Space, to select it without camera access. **Clear selection** or Escape removes the selection.
2. Click **Start Camera**, grant camera access, and wait for the model to load. Show one hand in good light, facing the camera. Nothing activates automatically; no microphone is requested.
3. **Swipe Right → Next Day; Swipe Left → Previous Day.** Swipe with an open hand across roughly 18% of the mirrored preview within 550 ms. Hold still or lower the hand afterward to rearm. Pointing and pinching cannot navigate the timeline.
4. **Thumbs Up → Play/Pause.** Fold all four fingers and hold the thumb upright and stationary for about 0.6 seconds (450 ms dwell after the stationary check). Release the pose for at least 200 ms before repeating. Holding an open palm still has no command.
5. **Point → Explore Nodes.** Extend only the index finger, with the other three fingers folded. After a 150 ms acquisition period, the fingertip moves a smoothed teal crosshair over the SVG. Camera x is mirrored; y is preserved. Exploration pauses playback.
6. An **amber dashed ring** means hover only. A node must be within 34 CSS pixels of the cursor to be a target. Its current-day details appear in the hover preview; a distant cursor highlights nothing.
7. **Pinch → Select Node.** After pointing at a company, bring the thumb and index tips together for at least 180 ms. The cursor freezes at its last pointing location while the fingers close. A **solid blue ring** confirms selection; connected current-day edges and neighboring companies are emphasized.
8. Separate fingertips for at least 150 ms and point again before another pinch. Pinch entry distance is at most 0.25× hand size; release requires at least 0.42× hand size. Hand size is the larger of palm width and wrist-to-middle-base distance, using world landmarks when available. These distances are scale normalized. An 1100 ms shared action cooldown and a 650 ms minimum pinch cooldown prevent rapid repeats (the shared cooldown governs when both apply).
9. Selection stays attached to the company across timeline updates, Reset, tracking loss, and camera shutdown. Details and neighbors reflect the current day; select another company or clear it explicitly.
10. **Stop Camera** terminates every track and the inference worker. Hiding the tab also stops the camera. Restart requires an explicit click. Frames and landmarks are never uploaded or recorded.

Swipes and all manual day changes pause playback first. Manual navigation clamps at Days 1 and 60 and displays boundary feedback. The original playback wraps from Day 60 to Day 1. The day indicator, summary, nodes, links, slider, and animation all use Lab 7’s application state.

## Implementation and reuse

- `index.html`, `style.css`: compact panel beside the original network; status, landmark overlay, instructions, feedback, fallback.
- `timeline.js`: obtains Lab 7’s D3-bound `play`, `pause`, `reset`, and slider input callbacks after asynchronous data loading. Gesture navigation invokes that same slider callback, which calls `showDay()` in Lab 7’s closure. No rendering or data joins are duplicated. Its playback flag mirrors calls through the original handlers; the only playback timer remains in Lab 7.
- `main.js`: waits for the existing handlers, connects timeline, explorer, and camera, and exports the app for inspection/tests.
- `exploration.js`: maps and smooths the index-tip cursor into SVG viewBox coordinates; uses the SVG screen transform for a CSS-pixel hit radius; maintains separate hover/selection state, current-day neighborhoods, and persistent details. It calls the original Lab 7 node-hover handler for detail formatting. Only classes and overlay markers change; no force simulation, data joins, or D3 renderer is duplicated. Node-transform observation keeps rings attached while the original force simulation settles.
- `camera.js`: user-triggered getUserMedia, preview, worker scheduling, landmark drawing, feedback, cleanup, cancellation tokens, initialization/inference timeouts, and permission/device/browser errors.
- `hand-worker.js`: initializes the real Hand Landmarker in VIDEO mode and performs CPU/WASM inference off the UI thread. At most one frame is in flight; transferred ImageBitmaps are closed immediately after inference. Tracks are not recorded.
- `gestures.js`: preserves the smoothed multi-frame swipe classifier and adds upright-thumb/folded-finger recognition, pointing, and normalized pinch proximity. Explicit state, stability feedback, separate latches, dwell, hysteresis, release, and cooldown prevent command conflicts. Loss, low confidence, identity changes, and frame gaps cancel incomplete gestures and cursor arming. Multiple hands suspend commands rather than silently switching targets.
- `config.js`: thresholds and version-pinned dependency URLs; adjust these for real-camera tuning.

The SDK applies detection, presence, and tracking thresholds at 0.7. The additional returned handedness score check measures confidence in the left/right identity, **not a per-landmark confidence score**. Geometry and temporal checks provide additional rejection criteria; they are heuristics rather than learned gesture-class confidence estimates.

## Observed limitations

Alicia manually tested the interface and reported imperfect real-world gesture recognition. **Pointing is frequently not detected reliably.** This is an observed limitation, not merely a hypothetical risk. Because point recognition arms the cursor and pinch target, gesture-based node selection remains experimental and may be difficult to use when pointing is missed.

Accuracy may depend on hand orientation, lighting, and camera conditions. Those influences are plausible limitations; no controlled comparison or per-gesture accuracy measurements were reported. The manual report does not establish that every gesture succeeds reliably. Automated synthetic-input tests verify the recognition rules and integration, not real-world accuracy.

Conventional controls remain available: timeline slider, Previous/Next, Play/Pause, Reset, hover and drag, mouse/keyboard node selection, and Clear selection/Escape. Use these when the camera misses a gesture. No model tuning or interaction redesign was performed for publication.

## Gesture state machine

Priority is **invalid/lost tracking > pinch/release > thumbs up > pointing > swipe navigation**. Each frame has one mode and at most one action.

| State | Meaning / exit |
| --- | --- |
| UNTRACKED | No/ambiguous/uncertain hand, identity change, or jump. Clear candidates and cursor; keep selection. Brief loss preserves action latches; 600 ms sustained disappearance rearms. |
| PINCH_PENDING | Close fingertips; only a prior stable point can arm selection. No swipe or thumb detection here. The wider hysteresis band maintains mode but cannot finish a loose pinch candidate. |
| PINCH_HELD | One selection command, then no repeats while held. Cursor remains fixed at its prior pointing location. |
| PINCH_RELEASE | Require separation ≥0.42× hand size for 150 ms. Interrupted release returns to held/pending state. Then point again to arm another selection. |
| THUMB_PENDING / THUMB_HELD | Folded fingers and upright thumb, stationary dwell. One playback command; release pose for 200 ms or lower the hand for 600 ms to rearm. |
| POINTING | Index-only pose; 150 ms acquisition before a cursor appears. This mode never fills a swipe movement window. Playback pauses during stable exploration. |
| NAVIGATE / SWIPE_HELD / COOLDOWN | Existing directional palm motion, duration/sample/vertical checks. One step, then stationary neutral or sustained disappearance plus cooldown before repeating. |

The cursor is cleared on loss, uncertainty, camera shutdown, and leaving exploration. A pinch entered without a prior point cannot acquire a stale target. Its action rechecks the frozen cursor against current node positions and refuses selection outside the interaction radius. Selection continues to update with the timeline even when the cursor is off.

## Dependencies and privacy

This directory is a complete Lab 10 entry point **within the course repository**. It intentionally shares `../lab7/lab7.js`, `../lab7/lab7.css`, `../css/style.css`, both `../data/lab7_assignment_*.csv` files, and the existing `../lab9/vendor/d3.v7.min.js`. Keep these paths when distributing it; copying only `lab10/` would omit shared dependencies. This avoids forking the visualization or duplicating its data. Relative paths support `/STATS401/lab10/` on GitHub Pages, including the worker URL resolved through `import.meta.url`. Publication verification is documented in `TESTING.md`.

Only after Start Camera, these hosted assets are downloaded:

- [MediaPipe tasks-vision 0.10.21 JavaScript](https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/vision_bundle.mjs)
- [Matching WASM directory](https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm)
- [Google Hand Landmarker float16 model, version 1](https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task)

The runtime/model may be cached normally by the browser; they are not committed as large assets. CDN/model hosts receive normal asset requests. Camera frames and landmarks stay in memory in this browser, are never uploaded, and are not saved, recorded, or sent to analytics. The main thread transfers current frames to a local worker only. External asset failures produce explicit feedback and shut down camera resources; no fabricated results are used as fallback.

References: [assignment](https://github.com/hiilab/stats-401/blob/main/Lab10.md), [official MediaPipe web guide](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js).

## Tests and submission

See [TESTING.md](TESTING.md) for completed automated checks and the outstanding physical webcam checklist, and [INSPECTION.md](INSPECTION.md) for the original Lab 7 audit. [DESIGN_REFLECTION.md](DESIGN_REFLECTION.md) contains the 100–200 word reflection. Test fixtures are explicitly synthetic and are never loaded by the production page.

With Node.js installed:

```sh
cd lab10
npm test
npm install
npx playwright install chromium
npm run test:browser
npm run test:published
```

The browser suite expects the root server on port 8010. Override `LAB10_URL` if needed. `BROWSER_EXECUTABLE` can select an installed Chrome executable; `PLAYWRIGHT_MODULE` can point to an existing Playwright installation. npm is needed only for optional browser tests, not for the application.

## Assignment checklist

- [x] Reuse a previous visualization: original Lab 7 renderer, style, and data.
- [x] Implement a novel modality: real MediaPipe webcam hand landmarks.
- [x] Support a specific task: adjacent-day comparison, playback control, and direct company/neighborhood exploration.
- [x] Visible recognition/action feedback: landmarks, gesture stability, cursor coordinates, hover versus selected details, last action.
- [x] Conventional fallback: timeline, playback, reset, hover, drag, mouse/keyboard selection, and Clear selection/Escape.
- [x] Require explicit action to activate the camera; no microphone access.
- [x] Explain interaction usage: visible guide and this README.
- [x] Include a 100–200 word English design reflection.

Implementation covers all eight assignment checklist items. Real-world gesture accuracy remains limited; use conventional controls when recognition is unreliable.
