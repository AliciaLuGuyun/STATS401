# Lab 7 inspection and integration

Inspected the local implementation before editing Lab 10 (2026-10-12). No applicable AGENTS.md was found in the repository or its ancestor directories. Existing `lab10/index.html` was only a placeholder. Other repository files were already untracked; they have not been committed or reorganized.

| Existing component | Behavior and Lab 10 reuse |
| --- | --- |
| `lab7/index.html` | Original page, datasets, controls, legend, findings and tooltip; unchanged. Lab 10 supplies the same renderer-required element IDs in its separate page. |
| `lab7/lab7.css` | Controls, daily summary, legend, company labels, transparent link hit targets, regional labels; loaded directly, with responsive overrides only in Lab 10. |
| `lab7/lab7.js` | CSV loading and `drawTemporalNetwork()`; loaded directly with no code fork or edits. |
| Companies CSV | 12 fixed company objects, company ID/name, sector and region; unchanged. |
| Transactions CSV | 367 dated daily transactions across 60 days, endpoints, amount, type and count; unchanged. |
| D3 simulation | One persistent force simulation with link, charge, collision and regional x/y anchors. Reuses company objects and recalculates daily volume/degree. |
| `showDay(day)` | Existing keyed link joins, 350 ms enter/update/exit transitions, node size/opacity changes, force-link update/restart, date and slider synchronization. Reached through its original slider callback. |
| `play()` | One D3 interval at 900 ms; wraps from Day 60 to Day 1; reused directly. |
| `pause()` | Stops and clears the D3 interval; reused directly before each manual/gesture step. |
| `reset()` | Pauses then calls `showDay(1)`; reused directly. |
| Slider input | Pauses then calls `showDay(+this.value)`; reused for button and gesture navigation, clamped by adapter. |
| Nodes | Hover/focus tooltip with name, sector, region, day volume and degree; D3 drag temporarily fixes positions and restarts/releases simulation. Preserved. |
| Edges | Transparent 14 px hit target for hover tooltip, showing endpoint names, date, type, amount and transaction count. Preserved. |
| Legend/summary | Original sector/type scales, region symbols/stroke patterns, daily active counts/value/cross-region/top company summary. Preserved. |

The original functions are enclosed in `drawTemporalNetwork()` and are not exported. D3 retains references to the bound handlers; `timeline.js` retrieves them with `selection.on()` after initial rendering. This provides a narrow reusable control adapter without changing the original Lab 7 or reimplementing D3 logic. The adapter replaces the page's handlers with wrappers that call those references and synchronize only Lab 10's playback-status display. Lab 7's timer and slider/day remain authoritative.

The SHA-256 baseline in `tests/lab7-baseline.sha256` was captured before implementation. The browser suite compares all three Lab 7 files and both reused CSVs to that baseline, even though these files were initially untracked and Git diff alone could not establish immutability.
