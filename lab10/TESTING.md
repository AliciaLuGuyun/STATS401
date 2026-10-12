# Testing summary — 2026-10-12

## Completed automated checks

**21/21 unit tests passed** with Node.js 24.19.0. See `tests/gestures.test.mjs` and `tests/unit-results.txt`. No unit tests remain failing.

The synthetic landmark sequences cover:

- Upright thumbs-up with all four fingers folded; exclusion of open palm, sideways thumb, and pointing.
- Stable thumb dwell, one command while held, release-to-rearm, brief versus sustained tracking loss.
- Removal of stationary open-palm commands; retained multi-frame, mirrored left/right swipes.
- Point stability, true index-tip coordinates, and complete swipe suppression during stationary or moving pointing.
- Hand-size-normalized pinch distances and scale invariance; prior-point arming, dwell, one-shot selection, hysteresis, sustained release, cooldown, and loose-pinch rejection.
- Pinch priority over swipes; hand loss cancelling incomplete pinch/thumb candidates.
- Confidence, malformed landmarks, multiple hands, identity switches, frame gaps, jitter, vertical motion, insufficient movement, and repeated-action rejection.
- Camera-to-viewBox transformation, mirrored x, unchanged y, edge clamping, viewBox offsets, cursor smoothing/reset.
- Nearest-node hit radius in CSS pixels, responsive/nonuniform scaling, empty and distant targets.

**23/23 browser checks passed** in headless installed Google Chrome using Playwright. See `tests/browser.test.mjs` and `tests/browser-results.json`. No critical page JavaScript errors occurred; no browser checks remain failing.

| Check | Result / evidence |
| --- | --- |
| Protected source files | SHA-256 matches for original Lab 7 HTML, JS, CSS, and both CSVs, using the baseline captured before the initial implementation. |
| Original renderer and data | 12 company nodes, one persistent network SVG, 367 records; 3 links on Day 1, 7 on Day 2, 9 on Day 60. |
| Timeline synchronization | Play advances, slider/gesture navigation pauses, Reset restores Day 1, boundaries clamp, playback wraps at Day 60. |
| Active vocabulary | Swipes and Thumbs Up reach original callbacks; old Open_Palm command is rejected. Guide contains all five gestures. |
| Cursor exploration | Synthetic index-tip coordinates place the cursor at the expected SVG location, pause playback, show stability and original current-day hover details, and preview one nearby node without selecting it. |
| Pinch selection | Synthetic point/pinch sequences pass through `CameraController.processResult()`, the production classifier, explorer, and original network. Exactly one action occurs, the cursor stays frozen while fingers move, and current neighbors/edges are highlighted. |
| Persistent selection | Selection survives day changes and camera stop; details and highlighted edges update to the new day. Clearing removes selection/dimming. |
| Radius and loss | Distant cursor cannot select a company; loss hides cursor, cancels incomplete pinch, and preserves prior selection. |
| Conventional fallback | Original company/edge hover, keyboard focus, node drag, timeline controls; added mouse click and keyboard Enter selection, Clear selection and Escape. |
| Explicit camera activation | No camera calls before Start Camera; audio is disabled. |
| Error handling | Controlled permission denial, absent camera, and model failure show feedback and preserve conventional controls. |
| Resource release | Actual generated-stream tracks end; worker terminates; video source clears; frame submissions stop. A late permission stream is immediately released after cancellation. |
| Visibility | Tab-hidden event stops camera; returning requires explicit restart. |
| Responsive layout | Desktop 1400×1000 and mobile 390×844 reviewed; no horizontal page overflow. |
| Actual model smoke test | Pinned MediaPipe runtime, WASM, and model initialize in the unchanged real worker. Real inference on a blank ImageBitmap returns no hands. |
| Errors | No critical JavaScript page errors. |

The camera lifecycle suite uses a generated **canvas capture stream**, with a controlled worker for scheduling and failure cases. Recognition tests inject deterministic landmarks into the production result-processing path. They do not request a physical camera. The separate model smoke test uses the real hosted runtime/model on a blank image; it does not fabricate a hand-detection response. **These checks are not physical webcam gesture validation.** Test fixtures are never loaded by the production application.

The browser suite generates desktop/mobile screenshots locally for visual inspection; these generated images are excluded from publication. The implementation and interaction tests were run locally at port 8010. Publication checks are documented separately below.

## Manual webcam tests completed

**User-reported manual interface test:** Alicia tested the interface and reported imperfect gesture recognition, particularly pointing, which was frequently not detected reliably. This is an observed recognition limitation. No per-gesture success rates, controlled lighting/orientation comparisons, or systematic camera shutdown results were provided, and none are inferred here.

The agent’s tests remain synthetic-input and browser integration checks. They do not establish successful physical webcam gesture recognition. Gesture-based selection remains experimental because its cursor acquisition depends on the unreliable pointing pose. Conventional controls remain available.

## Required real-gesture walkthrough

1. Open http://localhost:8010/lab10/ in current desktop Chrome/Edge. Click Start Camera, grant permission, and confirm real preview and landmarks. Use one hand in good light.
2. Swipe an open hand toward the mirrored preview’s right and left. Verify exactly one day step, synchronized summary/network/slider, correct boundaries, and paused playback. Hold still or lower the hand before repeating.
3. Fold four fingers and hold the thumb upright for roughly 0.6 seconds. Confirm one play/pause action and no repeat while held. Release for at least 200 ms, then repeat. A stationary open palm must do nothing.
4. Extend only the index finger. Verify cursor direction matches the mirrored preview, playback pauses, jitter is reduced, and cursor coordinates update. Bring the cursor within the amber hover radius. Hover details should change without creating a blue selection.
5. Pinch thumb/index together briefly. Confirm the cursor freezes, one company receives a solid blue ring, and only its current neighbors and connected edges are emphasized. Keep pinching to check no repeats; separate fingers clearly, point again, and select a different company.
6. Point away from nodes, then pinch. Confirm a visible no-target message and no change to the existing selection. Change days or Reset and confirm the selected company remains selected while its details/neighbors follow the day.
7. Remove the hand during a pending pinch or thumb hold. Confirm no delayed action; cursor disappears and existing selection remains. Check a second hand, occlusion, uncertain poses, dim light, backlight, and left/right hands. Tune thresholds in `config.js` only after measuring false positives/misses.
8. Stop Camera, hide the tab, navigate away, revoke permission, and disconnect the physical camera. Verify the device indicator turns off and tracks are released. Returning must not restart the camera automatically.
9. Use mouse click, keyboard Enter/Space, Clear selection/Escape, hover, drag, slider, and Play/Pause with the camera disabled. Repeat real-camera checks on intended additional browsers/devices; Safari and Firefox remain unverified.

## Limitations and status

Expected limitations include lighting/occlusion sensitivity, orientation-dependent finger geometry, imperfect handedness identity, inference and smoothing latency, residual force-layout motion while targeting, and the deliberate release/cooldown overhead. Normalized pinch distances reduce scale sensitivity; they do not prove accuracy for every hand or viewing angle. The thumb pose uses an upright image-space direction, so rotated hands may need repositioning. External runtime/model access is required for optional camera tracking.

Every requested feature is implemented and automated checks pass. The updated English reflection remains within 100–200 words. The user-reported pointing failures are documented; systematic webcam accuracy and broader browser/device validation remain outstanding. Lab 7, its original CSVs, and the MediaPipe inference worker were preserved.

## Publication checks

Before publication, the unchanged implementation passed the existing 21 unit tests and 23 integration/browser checks against the publication checkout. All shared renderer, stylesheet, D3, and CSV files match the existing GitHub main branch. Only Lab 10 and its homepage summary are included; generated screenshots, recordings, model binaries, and unrelated workspace files are excluded.

`npm run test:published` runs a separate smoke suite at the published GitHub Pages URL. Set `LAB10_URL` to run it against a local publication checkout instead. It checks HTTP/relative assets, original-file hashes, rendering/data, timeline synchronization, mouse/keyboard fallback, explicit camera activation, denied-access fallback, real MediaPipe worker/model loading on a blank image, homepage links, and critical console/page errors. It never uses a physical camera or claims real-gesture accuracy. MediaPipe’s successful CPU initialization INFO line is recorded separately even though TFLite writes it to stderr. Deployed results are reported after publication.
