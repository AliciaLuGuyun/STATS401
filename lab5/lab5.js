const tooltip = d3.select("#tooltip");
const districtOrder = ["Central", "North", "South", "East", "West"];

// Load both network tables. CSV fields start as strings; + converts measurements.
Promise.all([
  d3.csv("../data/lab5_assignment_stations.csv", d => ({
    id: d.id,
    station_name: d.station_name,
    district: d.district,
    daily_passengers: +d.daily_passengers,
    station_type: d.station_type
  })),
  d3.csv("../data/lab5_assignment_routes.csv", d => ({
    source: d.source,
    target: d.target,
    travel_time_min: +d.travel_time_min,
    route_type: d.route_type
  }))
]).then(([nodes, links]) => {
  drawNetwork(nodes, links);
}).catch(error => {
  console.error("Unable to build Lab 5:", error);
  d3.select("#data-status").attr("class", "error")
    .text("Unable to load the network. Run an HTTP server and check both CSV paths and the browser console.");
});

function drawNetwork(nodes, links) {
  const width = 1000;
  const height = 780;
  const stationById = new Map(nodes.map(d => [d.id, d]));
  const neighbors = new Map(nodes.map(d => [d.id, new Set()]));

  // Save neighbors while source and target are still string IDs.
  // forceLink later replaces those IDs with references to station objects.
  links.forEach(d => {
    neighbors.get(d.source).add(d.target);
    neighbors.get(d.target).add(d.source);
  });
  nodes.forEach(d => { d.degree = neighbors.get(d.id).size; });
  d3.select("#data-status").text(`${nodes.length} stations · ${links.length} direct routes · ${nodes.filter(d => d.degree === 0).length} isolated stations · undirected network`);

  // Create SVG: viewBox supplies coordinates independent of CSS display size.
  const svg = d3.select("#network").append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("aria-label", "Urban transit network; station numbers label all 50 stations");
  svg.append("title").text("Urban Transit Network — connectivity, not geography");

  // Create visual scales. A zero-based square-root radius gives proportional area.
  const districtColor = d3.scaleOrdinal().domain(districtOrder)
    .range(["#4e79a7", "#b65c08", "#27804d", "#a94c88", "#7862a6"]);
  const passengerRadius = d3.scaleSqrt()
    .domain([0, d3.max(nodes, d => d.daily_passengers)]).range([0, 19]);
  const timeExtent = d3.extent(links, d => d.travel_time_min);
  const timeColor = d3.scaleSequential()
    .domain(timeExtent).interpolator(t => d3.interpolateBlues(0.35 + 0.65 * t));
  const routeDash = d3.scaleOrdinal()
    .domain(["Metro", "Express", "Shuttle"]).range([null, "9,5", "2,5"]);
  const routeColor = d3.scaleOrdinal()
    .domain(routeDash.domain()).range(["#007c83", "#b54416", "#7538a5"]);
  const timeOpacity = d3.scaleLinear().domain(timeExtent).range([0.4, 1]);

  function styleStation(selection) {
    selection.attr("stroke", "#222")
      .attr("stroke-width", d => d.station_type === "Transfer" ? 4 : 1.5)
      .attr("stroke-dasharray", d => d.station_type === "Terminal" ? "3,2" : null);
  }
  drawLegends(districtColor, passengerRadius, timeColor, routeDash, routeColor, timeOpacity, styleStation);

  // Draw routes before stations so station symbols cover line endpoints.
  const route = svg.append("g").selectAll("line").data(links).join("line")
    .attr("class", "route").attr("stroke", d => timeColor(d.travel_time_min))
    .attr("stroke-width", 2.5).attr("stroke-linecap", "round")
    .attr("stroke-dasharray", d => routeDash(d.route_type));
  // Wider transparent hit areas make even dotted routes easy to hover.
  const routeHit = svg.append("g").selectAll("line").data(links).join("line")
    .attr("class", "route-hit");

  // Draw stations and labels: each group moves its circle and number together.
  const station = svg.append("g").selectAll("g").data(nodes, d => d.id).join("g")
    .attr("class", "station").attr("tabindex", 0)
    .attr("aria-label", d => `${d.station_name}, ${d.district}, ${d.station_type}, ${d.daily_passengers} daily passengers, ${d.degree} direct connections`);
  station.append("circle").attr("r", d => passengerRadius(d.daily_passengers))
    .attr("fill", d => districtColor(d.district)).call(styleStation);
  station.append("text").attr("class", "station-label")
    .attr("text-anchor", "middle").attr("dy", 4)
    .text(d => d.station_name.replace("Station ", ""));

  // Start force simulation. Constant distance: line length is NOT travel time.
  const simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id(d => d.id).distance(72).strength(0.65))
    .force("charge", d3.forceManyBody().strength(-150))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collision", d3.forceCollide(d => passengerRadius(d.daily_passengers) + 12))
    // Gentle positional forces keep disconnected stations from drifting far away.
    .force("x", d3.forceX(width / 2).strength(0.025))
    .force("y", d3.forceY(height / 2).strength(0.035));

  // Update station and route positions every tick. Keep symbols inside the SVG.
  simulation.on("tick", () => {
    nodes.forEach(d => {
      const padding = passengerRadius(d.daily_passengers) + 8;
      d.x = Math.max(padding, Math.min(width - padding, d.x));
      d.y = Math.max(padding, Math.min(height - padding, d.y));
    });
    [route, routeHit].forEach(selection => selection
      .attr("x1", d => d.source.x).attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x).attr("y2", d => d.target.y));
    station.attr("transform", d => `translate(${d.x},${d.y})`);
  }).on("end", () => d3.select("#simulation-status").text("Layout settled · drag to rearrange"));

  // Drag behavior: reheat, pin to the pointer, then release and cool again.
  station.call(d3.drag()
    .on("start", (event, d) => {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
      d3.select("#simulation-status").text("Layout responding…");
      tooltip.style("opacity", 0);
    })
    .on("drag", (event, d) => {
      const padding = passengerRadius(d.daily_passengers) + 8;
      d.fx = Math.max(padding, Math.min(width - padding, event.x));
      d.fy = Math.max(padding, Math.min(height - padding, event.y));
    })
    .on("end", (event, d) => {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }));

  // Highlight directly connected stations. Group opacity also fades their labels.
  let selectedId = "";
  function highlightStation(id) {
    station.attr("opacity", d => !id || d.id === id || neighbors.get(id).has(d.id) ? 1 : 0.12);
    route.attr("opacity", d => !id || d.source.id === id || d.target.id === id ? 1 : 0.08);
  }
  function restoreHighlight() {
    highlightStation(selectedId);
    tooltip.style("opacity", 0);
  }
  function stationDetails(d) {
    return `${d.station_name}\nDistrict: ${d.district}\nDaily passengers: ${d3.format(",")(d.daily_passengers)}\nStation type: ${d.station_type}\nDirect connections (degree): ${d.degree}`;
  }
  station.on("mouseenter", (event, d) => {
    highlightStation(d.id);
    showTooltip(event, stationDetails(d));
  }).on("mousemove", moveTooltip).on("mouseleave", restoreHighlight)
    .on("focus", (event, d) => {
      highlightStation(d.id);
      const box = event.currentTarget.getBoundingClientRect();
      showTooltip({ clientX: box.right, clientY: box.top }, stationDetails(d));
    }).on("blur", restoreHighlight);

  routeHit.on("mouseenter", (event, d) => {
    station.attr("opacity", n => n.id === d.source.id || n.id === d.target.id ? 1 : 0.12);
    route.attr("opacity", other => other === d ? 1 : 0.08);
    showTooltip(event, `${d.source.station_name} ↔ ${d.target.station_name}\n${d.route_type} · ${d.travel_time_min} minutes`);
  }).on("mousemove", moveTooltip).on("mouseleave", restoreHighlight);

  d3.select("#station-select").selectAll("option.station-option").data(nodes).join("option")
    .attr("class", "station-option").attr("value", d => d.id)
    .text(d => `${d.station_name} · ${d.district}`);
  d3.select("#station-select").on("change", event => {
    selectedId = event.target.value;
    restoreHighlight();
  });
  d3.select("#reset-network").on("click", () => {
    selectedId = "";
    d3.select("#station-select").property("value", "");
    restoreHighlight();
  });

  // Build adjacency matrix using the same station objects and resolved links.
  // Matrix ordering: district first, then numeric station name (2 before 10).
  const orderedNodes = [...nodes].sort((a, b) =>
    districtOrder.indexOf(a.district) - districtOrder.indexOf(b.district) ||
    a.station_name.localeCompare(b.station_name, undefined, { numeric: true }));
  const matrixData = [];
  orderedNodes.forEach(rowNode => {
    orderedNodes.forEach(colNode => {
      const foundLink = links.find(link =>
        (link.source.id === rowNode.id && link.target.id === colNode.id) ||
        (link.target.id === rowNode.id && link.source.id === colNode.id));
      matrixData.push({ row: rowNode.id, col: colNode.id, link: foundLink || null });
    });
  });

  const matrixSize = 1000;
  const margin = { top: 150, right: 30, bottom: 30, left: 150 };
  const matrixX = d3.scaleBand().domain(orderedNodes.map(d => d.id)).range([0, matrixSize]);
  const matrixY = d3.scaleBand().domain(orderedNodes.map(d => d.id)).range([0, matrixSize]);
  const matrixSvg = d3.select("#matrix").append("svg")
    .attr("width", margin.left + matrixSize + margin.right)
    .attr("height", margin.top + matrixSize + margin.bottom)
    .attr("aria-label", "Adjacency matrix with stations grouped by district");
  matrixSvg.append("title").text("Rows and columns are stations; colored cells are direct routes");
  const matrixGroup = matrixSvg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  // Render all 2,500 station pairs, including absent routes and the diagonal.
  const cells = matrixGroup.selectAll("rect.matrix-cell").data(matrixData).join("rect")
    .attr("class", "matrix-cell")
    .attr("x", d => matrixX(d.col)).attr("y", d => matrixY(d.row))
    .attr("width", matrixX.bandwidth()).attr("height", matrixY.bandwidth())
    .attr("fill", d => d.link ? routeColor(d.link.route_type) : d.row === d.col ? "#ddd" : "#f3f3f3")
    .attr("fill-opacity", d => d.link ? timeOpacity(d.link.travel_time_min) : 1)
    .attr("stroke", "white").attr("stroke-width", 0.8);
  const rowLabels = matrixGroup.append("g").selectAll("text").data(orderedNodes).join("text")
    .attr("class", "matrix-label row-label").attr("x", -10)
    .attr("y", d => matrixY(d.id) + matrixY.bandwidth() / 2)
    .attr("dy", "0.35em").attr("text-anchor", "end")
    .attr("fill", d => districtColor(d.district)).text(d => d.station_name);
  const colLabels = matrixGroup.append("g").selectAll("text").data(orderedNodes).join("text")
    .attr("class", "matrix-label col-label")
    .attr("transform", d => `translate(${matrixX(d.id) + matrixX.bandwidth() / 2},-10) rotate(-90)`)
    .attr("dy", "0.35em").attr("fill", d => districtColor(d.district)).text(d => d.station_name);

  // District boundaries make the five-by-five blocks explicit.
  districtOrder.forEach(district => {
    const members = orderedNodes.filter(d => d.district === district);
    const start = matrixX(members[0].id);
    const middle = start + members.length * matrixX.bandwidth() / 2;
    matrixGroup.append("line").attr("x1", start).attr("x2", start)
      .attr("y1", 0).attr("y2", matrixSize).attr("stroke", "#888").style("pointer-events", "none");
    matrixGroup.append("line").attr("y1", start).attr("y2", start)
      .attr("x1", 0).attr("x2", matrixSize).attr("stroke", "#888").style("pointer-events", "none");
    matrixGroup.append("text").attr("x", middle).attr("y", -112)
      .attr("text-anchor", "middle").attr("fill", districtColor(district)).text(district);
    matrixGroup.append("text").attr("transform", `translate(-112,${middle}) rotate(-90)`)
      .attr("text-anchor", "middle").attr("fill", districtColor(district)).text(district);
  });
  const rowOutline = matrixGroup.append("rect").attr("width", matrixSize).attr("height", matrixY.bandwidth());
  const colOutline = matrixGroup.append("rect").attr("height", matrixSize).attr("width", matrixX.bandwidth());
  [rowOutline, colOutline].forEach(outline => outline.attr("fill", "none")
    .attr("stroke", "#111").attr("stroke-width", 1.5).style("pointer-events", "none").style("display", "none"));
  cells.on("mouseenter", (event, d) => {
    const pair = `${stationById.get(d.row).station_name} ↔ ${stationById.get(d.col).station_name}`;
    const detail = d.link ? `${d.link.route_type} · ${d.link.travel_time_min} minutes`
      : d.row === d.col ? "Same station; no self-route" : "No direct route";
    showTooltip(event, `${pair}\n${detail}`);
    d3.select("#matrix-inspection").text(`${pair}: ${detail}`);
    rowOutline.attr("y", matrixY(d.row)).style("display", null);
    colOutline.attr("x", matrixX(d.col)).style("display", null);
    rowLabels.attr("font-weight", n => n.id === d.row ? "bold" : null);
    colLabels.attr("font-weight", n => n.id === d.col ? "bold" : null);
  }).on("mousemove", moveTooltip).on("mouseleave", () => {
    tooltip.style("opacity", 0);
    [rowOutline, colOutline].forEach(outline => outline.style("display", "none"));
    rowLabels.attr("font-weight", null);
    colLabels.attr("font-weight", null);
  });
}

// Tooltips use text, not HTML, so CSV values are displayed as plain text.
function showTooltip(event, text) {
  tooltip.text(text).style("opacity", 1);
  moveTooltip(event);
}
function moveTooltip(event) {
  const box = tooltip.node().getBoundingClientRect();
  tooltip.style("left", `${Math.max(8, Math.min(event.clientX + 14, window.innerWidth - box.width - 8))}px`)
    .style("top", `${Math.max(8, Math.min(event.clientY + 14, window.innerHeight - box.height - 8))}px`);
}

// Draw legends with the very same scales used by the marks.
function drawLegends(districtColor, passengerRadius, timeColor, routeDash, routeColor, timeOpacity, styleStation) {
  function legendBlock(container, title, width, height) {
    const block = d3.select(container).append("div").attr("class", "legend-block");
    block.append("strong").text(title);
    return block.append("svg").attr("width", width).attr("height", height);
  }
  const districts = legendBlock("#network-legend", "District → station fill", 440, 30);
  districtColor.domain().forEach((d, i) => {
    districts.append("circle").attr("cx", 10 + i * 88).attr("cy", 14).attr("r", 7).attr("fill", districtColor(d));
    districts.append("text").attr("x", 21 + i * 88).attr("y", 18).attr("font-size", 12).text(d);
  });
  const sizes = legendBlock("#network-legend", "Daily passengers → circle area", 275, 52);
  [2000, 5000, 9850].forEach((d, i) => {
    sizes.append("circle").attr("cx", 23 + i * 90).attr("cy", 21).attr("r", passengerRadius(d)).attr("fill", "#aaa");
    sizes.append("text").attr("x", 23 + i * 90).attr("y", 51).attr("text-anchor", "middle").attr("font-size", 12).text(d3.format(",")(d));
  });
  const types = legendBlock("#network-legend", "Station type → border", 320, 42);
  ["Local", "Transfer", "Terminal"].forEach((d, i) => {
    types.append("circle").datum({ station_type: d }).attr("cx", 18 + i * 103).attr("cy", 20)
      .attr("r", 11).attr("fill", "#ddd").call(styleStation);
    types.append("text").attr("x", 34 + i * 103).attr("y", 24).attr("font-size", 12).text(d);
  });
  const times = legendBlock("#network-legend", "Travel time → blue (darker = longer)", 290, 42);
  [2, 9, 16].forEach((d, i) => {
    times.append("line").attr("x1", 4 + i * 96).attr("x2", 54 + i * 96).attr("y1", 12).attr("y2", 12)
      .attr("stroke", timeColor(d)).attr("stroke-width", 2.5);
    times.append("text").attr("x", 4 + i * 96).attr("y", 35).attr("font-size", 12).text(`${d} min`);
  });
  const routes = legendBlock("#network-legend", "Route type → line pattern", 305, 42);
  routeDash.domain().forEach((d, i) => {
    routes.append("line").attr("x1", 4 + i * 100).attr("x2", 73 + i * 100).attr("y1", 12).attr("y2", 12)
      .attr("stroke", "#315e88").attr("stroke-width", 2.5).attr("stroke-linecap", "round").attr("stroke-dasharray", routeDash(d));
    routes.append("text").attr("x", 4 + i * 100).attr("y", 35).attr("font-size", 12).text(d);
  });
  const matrixKey = legendBlock("#matrix-legend", "Matrix: route hue + travel-time intensity", 390, 100);
  routeColor.domain().forEach((type, row) => {
    matrixKey.append("text").attr("x", 0).attr("y", 19 + row * 30).attr("font-size", 12).text(type);
    [2, 9, 16].forEach((time, col) => {
      matrixKey.append("rect").attr("x", 65 + col * 110).attr("y", 4 + row * 30).attr("width", 18).attr("height", 18)
        .attr("fill", routeColor(type)).attr("fill-opacity", timeOpacity(time));
      matrixKey.append("text").attr("x", 89 + col * 110).attr("y", 18 + row * 30).attr("font-size", 12).text(`${time} min`);
    });
  });
  d3.select("#matrix-legend").append("p").text("Label colors use the district key above. Gray = no direct route; darker gray diagonal = same station.");
}
