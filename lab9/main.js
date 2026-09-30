const WIDTH = 960;
const HEIGHT = 540;
const NO_DATA_COLOR = "#dedede";
const tooltip = d3.select("#tooltip");

let hoveredIso = null;
let selectedIso = null;
let choroplethPaths = d3.selectAll(null);
let cartogramPaths = d3.selectAll(null);

Promise.all([
  d3.csv("../data/lab9_gdp_2025_top50.csv", d => ({
    iso3: d.iso3.trim(),
    country: d.country,
    gdp: +d.gdp_2025_billion_usd,
    rank: +d.rank
  })),
  d3.json("data/ne_50m_admin_0_countries.geojson")
]).then(([gdpRows, world]) => buildLab(gdpRows, world)).catch(error => {
  console.error("Unable to load Lab 9 data:", error);
  d3.select("#join-audit").classed("error-card", true)
    .text("Unable to load or join the Lab 9 data. Serve the repository over HTTP and check the browser console.");
  d3.select("#cartogram-status").text("Cartogram could not be computed because the source data did not load.");
});

function buildLab(gdpRows, world) {
  const isoField = chooseIsoField(world.features, gdpRows);
  const gdpByIso = new Map(gdpRows.map(d => [d.iso3, d]));
  const geometryIso = new Set(world.features.map(d => d.properties[isoField]));
  const duplicateGdp = duplicateValues(gdpRows.map(d => d.iso3));
  const duplicateGeo = duplicateValues(world.features.map(d => d.properties[isoField]).filter(Boolean));
  const unmatched = gdpRows.filter(d => !geometryIso.has(d.iso3));
  const matched = gdpRows.length - unmatched.length;
  const geoWithoutGdp = world.features.filter(d => !gdpByIso.has(d.properties[isoField]));

  world.features.forEach(feature => {
    feature.properties.__iso3 = feature.properties[isoField];
    feature.properties.__gdp = gdpByIso.get(feature.properties.__iso3) || null;
  });

  renderAudit({ gdpRows, isoField, matched, unmatched, duplicateGdp, duplicateGeo, geoWithoutGdp, world });
  if (unmatched.length || duplicateGdp.length || duplicateGeo.length) {
    throw new Error("The geographic join audit failed. See the on-page audit for details.");
  }

  const color = d3.scaleSequentialLog(d3.interpolateYlGnBu)
    .domain(d3.extent(gdpRows, d => d.gdp));
  const displayWorld = {
    type: "FeatureCollection",
    features: world.features.filter(d => d.properties.__iso3 !== "ATA")
  };

  drawChoropleth(displayWorld, color);
  drawLegend(color);
  drawCartogram(displayWorld, color);
}

function chooseIsoField(features, rows) {
  const candidates = ["ADM0_A3", "ISO_A3", "GU_A3", "SOV_A3", "BRK_A3"];
  const ids = new Set(rows.map(d => d.iso3));
  return candidates
    .map(field => ({ field, matches: features.filter(d => ids.has(d.properties[field])).length }))
    .sort((a, b) => d3.descending(a.matches, b.matches))[0].field;
}

function duplicateValues(values) {
  return [...d3.rollup(values, group => group.length, d => d)]
    .filter(([, count]) => count > 1)
    .map(([value, count]) => `${value} (${count})`);
}

function renderAudit(audit) {
  const unmatchedText = audit.unmatched.length
    ? audit.unmatched.map(d => `${d.country} (${d.iso3})`).join(", ")
    : "None";
  d3.select("#join-audit").html(`
    <strong>Join audit passed</strong>
    <ul>
      <li>${audit.gdpRows.length} GDP rows; ${audit.matched} matched with Natural Earth features using <code>${audit.isoField}</code>.</li>
      <li>Unmatched GDP records: ${unmatchedText}.</li>
      <li>Duplicate GDP ISO identifiers: ${audit.duplicateGdp.length ? audit.duplicateGdp.join(", ") : "None"}; duplicate geographic <code>${audit.isoField}</code> identifiers: ${audit.duplicateGeo.length ? audit.duplicateGeo.join(", ") : "None"}.</li>
      <li>${audit.geoWithoutGdp.length} of ${audit.world.features.length} geographic features are outside the supplied top 50 and are treated as no data.</li>
    </ul>
  `);
}

function drawChoropleth(world, color) {
  const projection = d3.geoNaturalEarth1().fitExtent([[14, 14], [WIDTH - 14, HEIGHT - 14]], world);
  const path = d3.geoPath().projection(projection);
  const svg = d3.select("#choropleth").append("svg")
    .attr("viewBox", `0 0 ${WIDTH} ${HEIGHT}`).attr("role", "img")
    .attr("aria-labelledby", "choropleth-title");
  svg.append("title").attr("id", "choropleth-title")
    .text("2025 nominal GDP choropleth; scroll to zoom and drag to pan");
  const zoomLayer = svg.append("g");
  zoomLayer.append("path").datum({ type: "Sphere" }).attr("class", "sphere").attr("d", path);

  choroplethPaths = zoomLayer.append("g").selectAll("path")
    .data(world.features, d => d.properties.__iso3).join("path")
    .attr("class", d => `country${d.properties.__gdp ? "" : " no-data"}`)
    .attr("data-iso", d => d.properties.__iso3).attr("d", path)
    .attr("fill", d => d.properties.__gdp ? color(d.properties.__gdp.gdp) : NO_DATA_COLOR)
    .on("mouseenter", countryEntered).on("mousemove", moveTooltip)
    .on("mouseleave", countryLeft).on("click", countryClicked);

  const zoom = d3.zoom().scaleExtent([1, 8]).on("zoom", event => zoomLayer.attr("transform", event.transform));
  svg.call(zoom).on("dblclick.zoom", null);
}

function drawLegend(color) {
  const width = 700;
  const height = 63;
  const left = 10;
  const right = 10;
  const top = 8;
  const scale = d3.scaleLog().domain(color.domain()).range([left, width - right]);
  const ticks = [300, 1000, 3000, 10000, 30000];
  const svg = d3.select("#color-legend").append("svg").attr("viewBox", `0 0 ${width} ${height}`)
    .attr("aria-label", "Logarithmic color legend from 300 billion to 30.6 trillion US dollars");
  const gradient = svg.append("defs").append("linearGradient").attr("id", "gdp-gradient");
  d3.range(0, 1.001, 0.025).forEach(t => {
    gradient.append("stop").attr("offset", `${t * 100}%`)
      .attr("stop-color", color(scale.invert(left + t * (width - left - right))));
  });
  svg.append("rect").attr("x", left).attr("y", top).attr("width", width - left - right)
    .attr("height", 16).attr("fill", "url(#gdp-gradient)");
  svg.append("g").attr("transform", `translate(0,${top + 16})`)
    .call(d3.axisBottom(scale).tickValues(ticks).tickFormat(formatGdpShort).tickSize(5))
    .call(g => g.select(".domain").remove());
  svg.append("text").attr("class", "legend-label").attr("x", left).attr("y", height - 3)
    .text("2025 nominal GDP (current US$; logarithmic scale)");
  d3.select("#color-legend").append("span").attr("class", "missing-key")
    .html("<i></i> Not in provided top-50 dataset (no data)");
}

function drawCartogram(world, color) {
  const host = document.getElementById("cartogram");
  const topology = topojson.topology({ countries: world }, 1e5);
  const projection = d3.geoNaturalEarth1().fitExtent([[18, 18], [WIDTH - 18, HEIGHT - 18]], world);
  const noDataFloor = 10;

  const chart = Cartogram().width(WIDTH).height(HEIGHT).topoJson(topology).topoObjectName("countries")
    .projection(projection).iterations(12)
    .value(feature => feature.properties.__gdp ? feature.properties.__gdp.gdp : noDataFloor)
    .color(feature => feature.properties.__gdp ? color(feature.properties.__gdp.gdp) : NO_DATA_COLOR)
    .label(feature => feature.properties.__gdp ? feature.properties.__gdp.country : countryName(feature))
    .units(" billion US$").valFormatter(d3.format(",.1f"));
  chart(host);
  bindCartogramInteractions(host);
}

function bindCartogramInteractions(host, attempts = 0) {
  cartogramPaths = d3.select(host).selectAll("path.feature");
  if (cartogramPaths.empty() && attempts < 120) {
    requestAnimationFrame(() => bindCartogramInteractions(host, attempts + 1));
    return;
  }
  if (cartogramPaths.empty()) throw new Error("Cartogram geometry did not render.");
  cartogramPaths
    .attr("data-iso", d => d.properties.__iso3).classed("no-data", d => !d.properties.__gdp)
    .on("mouseenter.linked", countryEntered).on("mousemove.linked", moveTooltip)
    .on("mouseleave.linked", countryLeft).on("click.linked", countryClicked);
  d3.select("#cartogram-status")
    .text("Cartogram computed with 12 distortion iterations. Hover or click a country to coordinate the two views.");
  updateHighlight();
}

function countryEntered(event, feature) {
  hoveredIso = feature.properties.__iso3;
  highlightCountry(hoveredIso);
  showTooltip(event, feature);
}

function countryLeft() {
  hoveredIso = null;
  if (selectedIso) highlightCountry(selectedIso);
  else clearHighlight();
  hideTooltip();
}

function countryClicked(event, feature) {
  event.stopPropagation();
  const iso = feature.properties.__iso3;
  selectedIso = selectedIso === iso ? null : iso;
  hoveredIso = null;
  if (selectedIso) highlightCountry(selectedIso);
  else clearHighlight();
}

function highlightCountry() { updateHighlight(); }
function clearHighlight() { updateHighlight(); }

function updateHighlight() {
  const active = hoveredIso || selectedIso;
  [choroplethPaths, cartogramPaths].forEach(selection => selection
    .classed("is-linked", d => !!active && d.properties.__iso3 === active)
    .classed("is-selected", d => !!selectedIso && d.properties.__iso3 === selectedIso));
}

function showTooltip(event, feature) {
  const datum = feature.properties.__gdp;
  const name = datum ? datum.country : countryName(feature);
  tooltip.style("opacity", 1).html(datum
    ? `<strong>${escapeHtml(name)}</strong><br>2025 GDP: ${formatGdp(datum.gdp)}<br>GDP rank: #${datum.rank}`
    : `<strong>${escapeHtml(name)}</strong><br>Not in provided top-50 dataset<br><em>No GDP value supplied</em>`);
  moveTooltip(event);
}

function moveTooltip(event) {
  const node = tooltip.node();
  const pad = 14;
  const left = Math.min(event.clientX + pad, window.innerWidth - node.offsetWidth - pad);
  const top = Math.min(event.clientY + pad, window.innerHeight - node.offsetHeight - pad);
  tooltip.style("left", `${Math.max(8, left)}px`).style("top", `${Math.max(8, top)}px`);
}

function hideTooltip() { tooltip.style("opacity", 0); }
function countryName(feature) {
  return feature.properties.NAME_LONG || feature.properties.ADMIN || feature.properties.NAME || feature.properties.__iso3;
}
function formatGdp(value) {
  return value >= 1000 ? `$${d3.format(",.2f")(value / 1000)} trillion` : `$${d3.format(",.1f")(value)} billion`;
}
function formatGdpShort(value) {
  return value >= 1000 ? `$${d3.format("~g")(value / 1000)}T` : `$${d3.format("~g")(value)}B`;
}
function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[char]);
}
