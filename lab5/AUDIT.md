# Lab 5 final audit

Initial local verification: 2026-09-12. The initial audit was completed before publication. A subsequent requirement recheck and browser test run passed, and the user authorized uploading Lab 5 to GitHub.

## Files and repository context

Working Lab 5: `/Users/guyunlu/Documents/ChatGPT/STATS401/lab5/index.html`.

The workspace root has an initialized Git directory with no remote and pre-existing untracked course files. Its existing nested checkout, `/Users/guyunlu/Documents/ChatGPT/STATS401/.publish-lab4`, is connected to `https://github.com/AliciaLuGuyun/STATS401.git`. Matching Lab 5 files were placed in that checkout so the result is reviewable in the actual course repository. No new repository was created.

Changed/added paths, relative to EACH of those two existing roots:

- `lab5/index.html` — replaces the placeholder with both views, design explanations, and six findings.
- `lab5/lab5.js` — external loading, scales, force layout, interactions, matrix, legends.
- `lab5/lab5.css` — local styles; shared `css/style.css` unchanged.
- `lab5/WALKTHROUGH.md` — all 15 code sections, concept explanations, quiz reminders, practice steps.
- `lab5/AUDIT.md` — this inspection and verification record.
- `data/lab5_assignment_stations.csv` — unchanged official course dataset, previously absent locally.
- `data/lab5_assignment_routes.csv` — unchanged official course dataset, previously absent locally.

Earlier labs, shared styles, home navigation, proposal, and unrelated files were not edited. The home page already links to Lab 5. The nested checkout's pre-existing untracked `proposal.md` is preserved.

## Run and submit

From `/Users/guyunlu/Documents/ChatGPT/STATS401`:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open `http://127.0.0.1:8000/lab5/`. A server was left running there during this task. The Git-connected copy is also testable at `http://127.0.0.1:8000/.publish-lab4/lab5/`.

Read-only GitHub API verification showed Pages publishes from `main`, path `/`, with base URL `https://alicialuguyun.github.io/STATS401/`. After these changes are deliberately published, submit:

`https://alicialuguyun.github.io/STATS401/lab5/`

This is the submission destination; deployment should be verified after pushing. The D3 CDN requires internet access, as in previous labs.

## Existing conventions inspected

Read Lab 2, Lab 3, Lab 4 HTML/JavaScript, shared CSS, README, Lab 5 placeholder, root Git configuration, nested checkout status/remote, and existing project-log repository notes. No applicable AGENTS.md was found. Existing conventions are plain HTML, Arial, 1000px content width, numbered lab directories, per-lab JavaScript, D3 v7 from jsDelivr, external `../data/` files, and a back-to-home link. Lab 5 preserves those conventions with an additional local stylesheet.

## Official data inspection

Source: `https://github.com/hiilab/stats-401/blob/main/Lab5.md`, with CSVs fetched from that repository's `main/data/` directory. Tutorial variables were not used as assignment attributes.

| File | Rows excluding header | Columns |
|---|---:|---|
| Stations | 50 | id, station_name, district, daily_passengers, station_type |
| Routes | 50 | source, target, travel_time_min, route_type |

- Districts: Central, North, South, East, West; 10 stations each.
- Station types: Local 16, Transfer 17, Terminal 17.
- Route types: Metro 16, Express 17, Shuttle 17.
- Passengers: 1,373–9,850; all positive integers, 50 distinct values.
- Travel time: 2–16 minutes; observed integer values 2–12 and 14–16 (13 does not occur).
- IDs and names: 50 distinct IDs `s1`–`s50` and names Station 1–Station 50. Endpoint IDs are identifiers, not quantitative variables. There are 40 distinct source IDs and 44 distinct target IDs; direction is immaterial.
- No missing fields, duplicate IDs/names, duplicate undirected routes, self-links, or unknown endpoint IDs.
- Degree distribution: five degree-0 stations, four degree-1 stations, 27 degree-2 stations, 14 degree-3 stations.
- Isolated: 42, 43, 46, 48, 49. These stations are deliberately retained in BOTH views.
- Unexpected semantics: Terminal labels do not imply leaves; Transfer labels do not imply high degree. High passenger counts can occur at isolated stations. These are synthetic data, not real transit-performance evidence.

## Requirement → implementation

| Requirement | Encoding / implementation |
|---|---|
| district | `districtColor`; node fill and matrix label color |
| daily_passengers | `passengerRadius`; square-root radius gives proportional circle area |
| station_type | `styleStation`; thin/thick/dashed circle borders |
| travel_time_min | `timeColor`; sequential blue routes with equal width; `timeOpacity` in matrix |
| route_type | `routeDash` in network; `routeColor` in matrix |
| d3.forceSimulation | Link, repulsion, center, collision, plus weak x/y containment forces |
| dragging | d3.drag start/drag/end; alphaTarget, fx/fy, release |
| highlighting | `neighbors`, `highlightStation`, node/route events, persistent selector |
| tooltips | `stationDetails`, `showTooltip`, `moveTooltip`; route and matrix details |
| identification | Station numbers, full names in selector/tooltips and matrix labels |
| legends | `drawLegends`, using the same scales/styles as the marks |
| adjacency matrix | Same nodes/links, matrixData, band scales, rectangles, district-first ordering |
| design explanations | Two paragraphs in index.html, 245 words combined |
| six questions | Six entries in index.html, each with answerability/view/evidence/observation |

## Browser and data verification

Tested using a real local HTTP server and headless Chrome, with actual pointer movement/dragging. Inspected screenshots of the settled network, Station 7 hover, complete matrix, and mobile page.

- 50 station groups/circles/number labels and 50 visible routes rendered.
- The extra 50 transparent route hit targets are interaction aids, not additional routes.
- Both external CSVs loaded successfully; no page errors, console errors, or failed HTTP responses in the final run.
- Simulation settled; no station circle overlaps or station/label clipping in the tested settled state.
- Dragging moved Station 7 with the pointer, released fx/fy, and settled again.
- Hovering Station 7 kept exactly four stations (itself and three neighbors) and three touching routes visible; labels inherited the same fading.
- Tooltip displayed Station 7, North, 2,411 passengers, Terminal, degree 3.
- Route hover on 7–31 displayed Express and 16 minutes with both endpoints.
- Selecting isolated Station 48 kept one station and zero routes highlighted; clear restored all stations.
- Matrix: 2,500 cells, 100 route cells, 50 row labels, 50 column labels.
- Every matrix cell was checked against the external route CSV, including both endpoint orders and time/type values: zero mismatches.
- Cell positions and row/column ordering aligned; all 50 row/column names present.
- Matrix tooltips distinguished connected pair, absent pair, and diagonal. Connected pair 32–31 displayed Express, 7 minutes.
- At 390px viewport width, page width was exactly 390px. The wide charts/legends scroll internally, rather than making the page overflow.
- Git-connected copy loaded all 50 stations/routes and six findings under a URL prefix, checking the relative-path behavior needed for Pages.
- JavaScript syntax check passed. Design word count is 245.

An initial favicon 404 was fixed with a page-local empty favicon. An initial mobile legend overflow was fixed before the final checks.

## Official requirement checklist

- [x] d3.forceSimulation()
- [x] district encoded
- [x] daily_passengers encoded
- [x] station_type encoded
- [x] travel_time_min encoded
- [x] route_type encoded
- [x] dragging
- [x] highlighting
- [x] tooltips
- [x] legends / explanation
- [x] adjacency matrix
- [x] link existence visible
- [x] additional matrix attributes attempted
- [x] node-link design explained
- [x] matrix design explained
- [x] all six questions answered
- [x] visualization identified for every question
- [x] supporting encoding/interaction identified
- [x] actual observation given for every question

Also verified: provided 50-node/50-link files loaded externally, D3 data binding used, individual stations identifiable, same data used in both views.

## Review before submission

Read the six findings and design paragraphs in your own voice and try the interactions in WALKTHROUGH.md. “Central” is a district name; it does not imply graph centrality. Local degree is visible, but no betweenness calculation is encoded. District connectivity is interpreted as direct-route count. Border styles and matrix service hues use separate legends from the node-link route colors. Matrix time-intensity comparisons across hues are approximate; exact tooltip values support rankings. On smaller screens, horizontal scrolling is intentional to preserve readable station labels.

The assignment text includes leftover tutorial variable names; implementation follows the actual transit dataset and final checklist, as requested. The user subsequently requested publication after the requirement recheck, which passed.
