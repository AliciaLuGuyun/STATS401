# Lab 5 — code walkthrough and study notes

Open `lab5.js` alongside this guide. The main flow is load → scales → SVG marks → simulation → interaction → matrix. The page itself contains the submission design paragraphs and six findings; this guide is for studying.

## Before the code: what the network represents

A network is a set of entities and their relationships. Here a **node** is a station and a **link** is a direct transit connection. The station table stores one record per station; the route table stores a pair of station IDs plus travel time and service type. Separate tables avoid repeating each station's attributes on every connection and allow stations with no routes to remain present.

The network is undirected. `source` and `target` name two endpoints, not one-way travel. A missing direct route does not imply that no journey through intermediate stations exists. The data are synthetic, and district labels do not provide actual geographic coordinates.

## 1. Loading the two CSV files

Find `Promise.all([...]).then(([nodes, links]) => ...)` near the beginning.

```js
Promise.all([
  d3.csv("../data/lab5_assignment_stations.csv", /* row converter */),
  d3.csv("../data/lab5_assignment_routes.csv", /* row converter */)
]).then(([nodes, links]) => {
  drawNetwork(nodes, links);
});
```

The abbreviated comments above stand for the actual row-conversion functions in the source. `d3.csv()` immediately returns a Promise, which later resolves to an array of row objects. The requests can run concurrently. `Promise.all()` waits until both finish and preserves their order: stations first, routes second. The destructuring `[nodes, links]` gives those arrays useful names. If either request fails, the final `.catch()` displays an error.

**Why needed:** a route cannot be drawn until we know both its endpoints. The `../data/` path goes up from `lab5/` into the repository's data folder and also works under a GitHub Pages repository prefix.

**Quiz:** a Promise is not the loaded array. Use the resolved data inside `.then()` or after `await`.

## 2. Converting numbers

```js
daily_passengers: +d.daily_passengers
travel_time_min: +d.travel_time_min
```

CSV text such as `"9850"` becomes the number `9850`. IDs such as `"s50"` stay strings, and district/type fields stay categories.

**Why needed:** quantitative scales, arithmetic, and comparisons need numeric data. String addition would concatenate rather than add.

**Quiz:** unary `+` converts; it does not increment. An empty string converts to zero, so inspect missing values before conversion. These source CSVs have no missing fields.

## 3. Creating SVG

Find `const svg = d3.select("#network").append("svg")`.

```js
.attr("viewBox", `0 0 ${width} ${height}`)
```

SVG is the browser's vector drawing surface. Here its coordinate system is 1000 by 780 units. CSS controls its displayed size. Groups (`g`) collect marks that move together; `circle`, `line`, and `text` draw stations, routes, and labels.

**Why needed:** the simulation only calculates numbers; SVG turns them into something visible.

**Quiz:** `viewBox` coordinates are not necessarily screen pixels. D3 drag accounts for the SVG coordinate transformation.

## 4. Creating scales

Find the comment `Create visual scales`.

- `districtColor`: ordinal scale, one distinct fill per unordered district.
- `passengerRadius`: square-root scale from `[0, 9850]` to `[0, 19]`. Circle area is proportional to daily passengers because area is πr² and radius is proportional to √passengers. Doubling passengers doubles area, not radius.
- `timeColor`: sequential scale over the observed 2–16 minute range. We use the blue palette from 35% through 100%, avoiding nearly white short routes. Darker means longer, not stronger.
- `routeDash`: ordinal scale: Metro solid, Express long dashes, Shuttle short dots. SVG dash strings alternate painted lengths and gaps.
- `routeColor`: matrix-only hue scale distinguishing route categories.
- `timeOpacity`: matrix-only linear scale mapping 2–16 minutes to opacity 0.4–1. Even short routes remain visibly different from absent routes.

`styleStation()` uses a thin border for Local, thick for Transfer, and dashed for Terminal. Keeping circles avoids mixing passenger-area comparisons with different shapes. Border width is a category cue and should not be interpreted as a quantitative variable.

**Why needed:** consistent scales let viewers interpret marks and legends together. `drawLegends()` uses these same scales.

**Quiz:** domain = input values; range = output visual values. Ordinal scales encode categories; linear/sequential scales encode ordered quantitative measurements. Node fill and route color encode different things—read the keys.

## 5. Drawing links

```js
svg.append("g").selectAll("line").data(links).join("line")
```

This binds each route object to one SVG line. `.join("line")` creates missing lines, updates existing ones, and removes surplus ones. Attribute callbacks receive each line's bound object as `d`.

Routes are drawn before stations because later SVG elements appear on top. `stroke` encodes time; `stroke-dasharray` encodes service; width is always 2.5.

`routeHit` creates an additional transparent, 12-unit-wide line for pointer detection. There are still only 50 visible routes. The extra hit targets make thin/dotted routes easier to hover.

**Quiz:** data binding associates objects with DOM elements. At this point, the lines have appearance but no endpoint coordinates.

## 6. Drawing nodes

```js
.data(nodes, d => d.id).join("g")
```

Each station receives one group containing a circle and number. The ID key identifies stations if data are updated. Circle radius comes from passengers; fill from district; border from station type. The text turns “Station 7” into “7”; full names remain in tooltips and the selector.

**Why needed:** moving the group moves its circle and label together, and fading the group fades both. This avoids a second set of label-position updates.

**Quiz:** `d => d.id` is a stable binding key; it is different from an array index.

## 7. Creating the force simulation

```js
const simulation = d3.forceSimulation(nodes)
  .force("link", d3.forceLink(links).id(d => d.id).distance(72).strength(0.65))
  .force("charge", d3.forceManyBody().strength(-150))
  .force("center", d3.forceCenter(width / 2, height / 2))
  .force("collision", d3.forceCollide(d => passengerRadius(d.daily_passengers) + 12))
```

The simulation changes the station objects, adding/updating positions (`x`, `y`) and velocities (`vx`, `vy`). It gradually cools as its `alpha` decreases.

| Force | Visual effect and purpose | Parameter changes |
|---|---|---|
| Link | Spring-like adjustment of connected stations toward a target separation | Larger distance spreads connected stations farther apart; higher strength enforces that distance more strongly |
| Many-body | Negative strength repels stations, opening space | More negative means stronger repulsion; positive means attraction |
| Center | Translates the layout toward the SVG center | Changing x/y shifts its center; this is not a boundary constraint |
| Collision | Reduces overlapping station symbols | Larger radius increases personal space; higher strength/more iterations enforce separation more strongly |

The additional weak `forceX` and `forceY` attract stations toward the display center so isolated stations do not drift away indefinitely. They do not encode districts. The link distance is constant, so physical route length does not represent minutes.

`forceLink().id(d => d.id)` resolves an endpoint string such as `"s7"` to the matching station object. After initialization, `link.source` and `link.target` are objects, so code uses `link.source.id` or `link.source.x`.

**Quiz:** force layout positions are not geography or centrality scores. Force simulation mutates objects. The `neighbors` lookup is built before endpoint strings are replaced.

## 8. The tick function

```js
simulation.on("tick", () => {
  // Boundary handling, followed by endpoint updates:
  // x1/y1 from d.source.x/y; x2/y2 from d.target.x/y
  station.attr("transform", d => `translate(${d.x},${d.y})`);
});
```

Each tick is one step of the layout calculation. The actual function first clamps station positions inside the drawing area, allowing space for radius and border. It then updates both visible and invisible route endpoints and finally station group positions.

**Why needed:** changing a JavaScript object's coordinates does not automatically update SVG attributes. Repeated updates keep lines attached while stations move. The `end` event changes the status to “Layout settled.”

**Quiz:** the simulation calculates; the tick listener draws. Registering another `.on("tick", ...)` without a namespace would replace the first listener, so all position updates stay together.

## 9. Dragging

Find `station.call(d3.drag()...)`.

- Start: `.alphaTarget(0.3).restart()` reheats/restarts the layout; `fx` and `fy` temporarily fix the station's position.
- Drag: update `fx` and `fy` from `event.x` and `event.y`, clamped inside the SVG.
- End: `.alphaTarget(0)` lets the layout cool; setting `fx = null` and `fy = null` releases the station.

`if (!event.active)` prevents one drag from unnecessarily changing the shared simulation heat while another drag is active.

**Why needed:** merely changing `x` and `y` would allow forces to immediately move the station away from the pointer. Fixed coordinates hold it during the drag while connected stations respond.

**Quiz:** `restart()` restarts the timer; it does not by itself raise alpha. `null` releases a fixed coordinate; zero would pin it at zero.

## 10. Highlighting

Find `highlightStation(id)` and the `neighbors` Map.

```js
!id || d.id === id || neighbors.get(id).has(d.id) ? 1 : 0.12
```

A Map stores one Set of neighbor IDs per station. Each undirected route adds both directions. Set size gives degree without counting a neighbor twice.

The expression keeps all stations visible when no station is selected. Otherwise it keeps the selected station and its immediate neighbors visible and fades the rest. Routes remain visible only if they touch the selected station. A route between two neighbors is not automatically included—it does not touch the selected station.

`restoreHighlight()` returns to the selector's persistent choice after hovering ends. Route hover instead isolates that route and its two endpoints. Keyboard focus also highlights stations.

**Quiz:** degree counts direct neighbors, not passengers or all reachable stations. Highlighting does not remove data or change the simulation.

## 11. Tooltips

Find `stationDetails()`, `showTooltip()`, and `moveTooltip()`.

`stationDetails()` assembles name, district, formatted passenger volume, station type, and degree. `showTooltip()` writes plain text and shows the div. `moveTooltip()` positions it near the pointer and clamps it to the viewport. CSS `white-space: pre-line` displays line breaks; `pointer-events: none` keeps the tooltip from stealing hover.

Route tooltips give endpoints, service type, and minutes. Matrix tooltips also distinguish absent routes and same-station diagonal cells.

**Why needed:** exact values remain available without putting long descriptions on all 50 marks.

**Quiz:** `position: fixed` pairs with `clientX/clientY`; absolute page positioning normally pairs with page coordinates. `.text()` treats CSV values as text, rather than interpreting them as HTML.

## 12. Constructing matrixData

Find the nested `orderedNodes.forEach()` loops.

```js
const foundLink = links.find(link =>
  (link.source.id === rowNode.id && link.target.id === colNode.id) ||
  (link.target.id === rowNode.id && link.source.id === colNode.id));
matrixData.push({ row: rowNode.id, col: colNode.id, link: foundLink || null });
```

Each of the 50 row stations is paired with each of the 50 column stations, giving 2,500 cell objects. The lookup checks both endpoint orders because the network is undirected. Each cell stores the actual route object or `null`.

**Why needed:** the route table lists only existing links, while a complete matrix also needs absent pairs. This straightforward search is easy to follow and sufficient for 50 stations/50 routes; a larger graph would benefit from a pair lookup Map.

**Quiz:** 50 undirected routes give 100 filled cells, not 50, because every route is mirrored. No duplicate pair/self-route exists in these CSVs; this simple matrix assumes at most one route per unordered station pair.

## 13. scaleBand for rows and columns

```js
const matrixX = d3.scaleBand().domain(orderedNodes.map(d => d.id)).range([0, matrixSize]);
const matrixY = d3.scaleBand().domain(orderedNodes.map(d => d.id)).range([0, matrixSize]);
```

A band scale divides the 1,000-unit axis into 50 equal slots. Each slot is 20 units wide/high. Station IDs are categorical labels, even though their names contain numbers. Both axes use the same ordered domain.

**Why needed:** the same scale places cells and labels, preventing misalignment. Full labels stay 12 pixels tall and the container scrolls rather than squeezing them.

**Quiz:** `scaleBand(id)` gives a band's start; `.bandwidth()` gives its size. Add half the bandwidth to center a label.

## 14. Rendering matrix cells

Find `.selectAll("rect.matrix-cell").data(matrixData).join("rect")`.

`x` comes from the column ID and `y` from the row ID. Width/height come from band sizes. Existing routes use service hue and time opacity. Absent pairs use pale gray; diagonal cells use darker gray. A white stroke separates cells. Hover adds row/column outlines and reports the selected pair.

**Why needed:** a route is now represented by cell position and appearance rather than a connecting line. The data have not changed.

**Quiz:** absence is checked through `d.link`, not whether travel time is positive. A hypothetical zero-minute route would still be an existing route. Opacity comparisons across different hues are approximate; use tooltips for exact times.

## 15. Matrix ordering

The sorting code appears before matrix construction:

```js
const orderedNodes = [...nodes].sort((a, b) =>
  districtOrder.indexOf(a.district) - districtOrder.indexOf(b.district) ||
  a.station_name.localeCompare(b.station_name, undefined, { numeric: true }));
```

`[...nodes]` makes a new array so sorting does not reorder the simulation's array. It retains references to the same station objects. District rank is the primary key; if equal, numeric name comparison is the secondary key. Numeric comparison puts Station 2 before Station 10. District boundary lines divide the matrix into comparable 10-by-10 blocks.

**Why needed:** grouping makes the South–East concentration and sparse within-district blocks visible. Sorting by station type could reveal role patterns, but would make finding station numbers less predictable; the node-link borders already show type.

**Quiz:** reordering changes where cells appear, not which routes exist. A matrix makes pair lookup and group patterns easier; multi-step path following and intuitive topology are often easier in a node-link view.

## Try these in the finished visualization

1. Hover Station 7: identify 6, 8, and 31 as its neighbors. Notice that its Terminal border does not make it a leaf.
2. Select Station 48: its large circle remains, but no route remains highlighted. Explain why size and degree differ.
3. Hover 7–31: use the tooltip to confirm the darkest-route candidate is 16 minutes.
4. In the matrix, compare South–East with North–West and inspect the Central–Central Shuttle cells.
5. Drag Station 7, release it, and explain why all three link endpoints move and then settle.

## What I need to know from Lab 5

- Two external tables represent entities and relationships; preserve IDs and convert quantitative strings.
- Promise.all waits for both tables; D3 binding associates each record with a visual element.
- Domain is data; range is appearance. Categories need distinct symbols/colors, while quantities need ordered channels.
- Square-root radius makes circle area proportional to passengers.
- ForceLink resolves IDs into node references; forces calculate positions and tick updates SVG.
- Dragging fixes/repositions/releases nodes and reheats the layout.
- Highlighting reveals direct neighbors; tooltips reveal exact attributes.
- Matrix rows and columns are the same stations. Undirected routes produce symmetric cells.
- Position, passenger volume, station type, and degree are different ideas.
- Visual findings should identify the view, encoding/interaction, observation, and limitations.
