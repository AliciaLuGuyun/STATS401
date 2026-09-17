const statusColor = d3.scaleOrdinal()
  .domain(["Increase", "Unchanged", "Decrease"])
  .range(["#4c9f70", "#999999", "#c44e52"]);

const tooltip = d3.select("#tooltip");
const formatGDP = d3.format(",");

drawLegend();

d3.json("../data/lab6_assignment_gdp.json")
  .then(data => {
    const countryCount = d3.hierarchy(data).leaves().length;
    d3.select("#data-status").text(`${countryCount} countries · 6 continents · 15 areas`);
    drawTreemap(data, "#treemap-squarify", d3.treemapSquarify);
    drawTreemap(data, "#treemap-binary", d3.treemapBinary);
  })
  .catch(error => {
    console.error("Unable to load the Lab 6 hierarchy:", error);
    d3.select("#data-status").attr("class", "error")
      .text("Unable to load the hierarchical GDP data.");
  });

function drawLegend() {
  const items = d3.select("#status-legend")
    .selectAll("span")
    .data(statusColor.domain())
    .join("span");

  items.append("i")
    .attr("class", "status-swatch")
    .style("background", status => statusColor(status));
  items.append("span").text(status => status);
}

function drawTreemap(data, selector, tileMethod) {
  const width = 960;
  const height = 600;

  // Each layout receives a fresh hierarchy because treemap() adds coordinates.
  const root = d3.hierarchy(data)
    .sum(d => d.gdp || 0)
    .sort((a, b) => b.value - a.value);

  d3.treemap()
    .tile(tileMethod)
    .size([width, height])
    .paddingOuter(4)
    .paddingInner(2)
    .paddingTop(d => d.depth === 1 ? 24 : d.depth === 2 ? 19 : 0)
    .round(true)(root);

  const layoutName = tileMethod === d3.treemapBinary ? "Binary" : "Squarify";
  const svg = d3.select(selector)
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("role", "img")
    .attr("aria-label", `${layoutName} treemap of GDP by continent, area, and country`);

  const countries = svg.append("g")
    .selectAll("g")
    .data(root.leaves())
    .join("g")
    .attr("class", "country-cell")
    .attr("tabindex", 0)
    .attr("transform", d => `translate(${d.x0},${d.y0})`)
    .attr("aria-label", d => countryDetails(d));

  countries.append("rect")
    .attr("width", d => Math.max(0, d.x1 - d.x0))
    .attr("height", d => Math.max(0, d.y1 - d.y0))
    .attr("fill", d => statusColor(d.data.status));

  countries.each(function(d) {
    const cellWidth = d.x1 - d.x0;
    const cellHeight = d.y1 - d.y0;
    if (cellWidth < 62 || cellHeight < 35) return;

    const label = d3.select(this).append("text")
      .attr("class", "country-label")
      .attr("x", 5)
      .attr("y", 15);
    label.append("tspan").text(d.data.name);

    if (cellHeight >= 52 && cellWidth >= 82) {
      label.append("tspan")
        .attr("class", "gdp-label")
        .attr("x", 5)
        .attr("dy", 15)
        .text(`$${formatGDP(d.data.gdp)}B`);
    }
  });

  drawHierarchyLayer(svg, root.descendants().filter(d => d.depth === 2), "area");
  drawHierarchyLayer(svg, root.descendants().filter(d => d.depth === 1), "continent");

  countries
    .on("mouseenter", (event, d) => showTooltip(event, d))
    .on("mousemove", moveTooltip)
    .on("mouseleave", hideTooltip)
    .on("focus", (event, d) => {
      const box = event.currentTarget.getBoundingClientRect();
      showTooltip({ clientX: box.right, clientY: box.top }, d);
    })
    .on("blur", hideTooltip);
}

function drawHierarchyLayer(svg, nodes, level) {
  svg.append("g")
    .selectAll("rect")
    .data(nodes)
    .join("rect")
    .attr("class", `${level}-outline`)
    .attr("x", d => d.x0)
    .attr("y", d => d.y0)
    .attr("width", d => d.x1 - d.x0)
    .attr("height", d => d.y1 - d.y0);

  const labels = svg.append("g")
    .selectAll("text")
    .data(nodes.filter(d => d.x1 - d.x0 > 75 && d.y1 - d.y0 > 35))
    .join("text")
    .attr("class", `${level}-label`)
    .attr("x", d => d.x0 + 5)
    .attr("y", d => d.y0 + (level === "continent" ? 17 : 14))
    .text(d => d.data.name);

  // Remove group labels that would extend outside their own rectangle.
  labels.each(function(d) {
    if (this.getComputedTextLength() > d.x1 - d.x0 - 10) {
      d3.select(this).remove();
    }
  });
}

function countryDetails(d) {
  const area = d.parent;
  const continent = area.parent;
  return `${d.data.name}\nContinent: ${continent.data.name}\nArea: ${area.data.name}\nGDP: $${formatGDP(d.data.gdp)} billion\nStatus: ${d.data.status}`;
}

function showTooltip(event, d) {
  tooltip.text(countryDetails(d)).style("opacity", 1);
  moveTooltip(event);
}

function moveTooltip(event) {
  const box = tooltip.node().getBoundingClientRect();
  tooltip
    .style("left", `${Math.max(8, Math.min(event.clientX + 14, window.innerWidth - box.width - 8))}px`)
    .style("top", `${Math.max(8, Math.min(event.clientY + 14, window.innerHeight - box.height - 8))}px`);
}

function hideTooltip() {
  tooltip.style("opacity", 0);
}
