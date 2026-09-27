(() => {
  const TERRITORIES = new Set(["Puerto Rico", "Guam", "Virgin Islands"]);
  const CHARACTERISTIC_ORDER = ["Overall", "Age", "Education", "Race/Ethnicity"];
  const COLOR_DOMAIN = [10, 55];
  const missingFill = "url(#missing-pattern)";

  const characteristicSelect = d3.select("#characteristic-select");
  const groupSelect = d3.select("#group-select");
  const groupControl = d3.select("#group-control");
  const periodLabel = d3.select("#period-label");
  const scopeLabel = d3.select("#scope-label");
  const educationNotice = d3.select("#education-notice");
  const tooltip = d3.select("#tooltip");
  const selectedDetail = d3.select("#selected-detail");

  let allData = [];
  let stateFeatures = [];
  let selectedState = null;
  let hoveredState = null;
  let currentRows = [];
  let currentGroup = "All adults";

  const color = d3.scaleSequential(d3.interpolateRgbBasis(["#f0f6e8", "#9bcf91", "#3d8a67", "#583073"]))
    .domain(COLOR_DOMAIN).clamp(true);

  Promise.all([
    d3.csv("data/obesity_prevalence.csv", d => ({
      ...d,
      prevalence: d.prevalence === "" ? null : +d.prevalence,
      ci_low: d.ci_low === "" ? null : +d.ci_low,
      ci_high: d.ci_high === "" ? null : +d.ci_high,
      suppressed: d.suppressed === "true"
    })),
    d3.json("data/states-10m.json")
  ]).then(([data, us]) => {
    allData = data;
    stateFeatures = topojson.feature(us, us.objects.states).features
      .filter(d => !["60", "66", "69", "72", "78"].includes(String(d.id).padStart(2, "0")));
    setupControls();
    drawLegend();
    update();
    d3.select(window).on("resize", debounce(update, 150));
  }).catch(error => {
    console.error(error);
    d3.select("#map").html(`<p class="empty-message">The visualization data could not be loaded. Preview this project through a local web server rather than opening the HTML file directly.</p>`);
  });

  function setupControls() {
    const available = new Set(allData.map(d => d.characteristic));
    characteristicSelect.selectAll("option")
      .data(CHARACTERISTIC_ORDER.filter(d => available.has(d)))
      .join("option").attr("value", d => d).text(d => d);

    characteristicSelect.on("change", () => {
      selectedState = null;
      setGroups();
      update();
    });
    groupSelect.on("change", () => {
      selectedState = null;
      currentGroup = groupSelect.property("value");
      update();
    });
    d3.select("#clear-selection").on("click", () => {
      selectedState = null;
      updateLinkedState();
      renderSelectedDetail();
    });
    setGroups();
  }

  function setGroups() {
    const characteristic = characteristicSelect.property("value");
    const groups = Array.from(new Set(allData.filter(d => d.characteristic === characteristic).map(d => d.group)));
    groupSelect.selectAll("option").data(groups).join("option").attr("value", d => d).text(d => d);
    currentGroup = groups[0];
    groupSelect.property("value", currentGroup);
    groupControl.style("display", characteristic === "Overall" ? "none" : null);
  }

  function update() {
    const characteristic = characteristicSelect.property("value");
    currentGroup = groupSelect.property("value") || currentGroup;
    currentRows = allData.filter(d => d.characteristic === characteristic && d.group === currentGroup);
    const isEducation = characteristic === "Education";
    const period = currentRows[0]?.period_label || "—";
    periodLabel.text(period);
    scopeLabel.text(isEducation ? "National summary" : "State and territory estimates");
    educationNotice.property("hidden", !isEducation);
    d3.select("#map-title").text(isEducation ? "State estimates not published" : currentGroup);
    d3.select("#map-help").text(isEducation ? "National summary; state interaction unavailable" : "Hover for details · click to keep a state selected");
    d3.select("#rank-title").text(isEducation ? "National education estimates" : "States ranked by prevalence");
    drawMap(isEducation);
    drawDotPlot(isEducation);
    drawTerritories(isEducation);
    renderSelectedDetail();
  }

  function drawMap(isEducation) {
    const container = d3.select("#map");
    const width = Math.max(320, container.node().clientWidth || 700);
    const height = Math.round(width * .62);
    const svg = container.selectAll("svg").data([null]).join("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("aria-label", isEducation ? "State map unavailable for national-only education estimates" : `Map of ${currentGroup} obesity prevalence`);

    const defs = svg.selectAll("defs").data([null]).join("defs");
    const pattern = defs.selectAll("pattern").data([null]).join("pattern")
      .attr("id", "missing-pattern").attr("width", 7).attr("height", 7)
      .attr("patternUnits", "userSpaceOnUse").attr("patternTransform", "rotate(45)");
    pattern.selectAll("rect").data([null]).join("rect").attr("width", 7).attr("height", 7).attr("fill", "#ebe9e3");
    pattern.selectAll("line").data([null]).join("line").attr("x1", 0).attr("x2", 0).attr("y2", 7).attr("stroke", "#c9c7c1").attr("stroke-width", 2);

    const projection = d3.geoAlbersUsa().fitExtent([[16, 15], [width - 16, height - 16]], {type: "FeatureCollection", features: stateFeatures});
    const path = d3.geoPath(projection);
    const byFips = new Map(currentRows.map(d => [d.state_fips, d]));

    svg.selectAll("path.state")
      .data(stateFeatures, d => String(d.id).padStart(2, "0"))
      .join("path")
      .attr("class", "state")
      .attr("d", path)
      .attr("fill", d => {
        const row = byFips.get(String(d.id).padStart(2, "0"));
        return !isEducation && row?.prevalence != null ? color(row.prevalence) : missingFill;
      })
      .attr("tabindex", 0)
      .attr("aria-label", d => ariaLabel(byFips.get(String(d.id).padStart(2, "0"))))
      .on("pointerenter focus", (event, d) => {
        const row = byFips.get(String(d.id).padStart(2, "0"));
        hoveredState = row?.state || null;
        updateLinkedState();
        showTooltip(event, row, isEducation);
      })
      .on("pointermove", moveTooltip)
      .on("pointerleave blur", () => {
        hoveredState = null;
        updateLinkedState();
        hideTooltip();
      })
      .on("click keydown", (event, d) => {
        if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
        const row = byFips.get(String(d.id).padStart(2, "0"));
        if (!row || isEducation) return;
        selectedState = selectedState === row.state ? null : row.state;
        updateLinkedState();
        renderSelectedDetail();
      });

    if (isEducation) {
      svg.selectAll("text.map-overlay").data([null]).join("text")
        .attr("class", "map-overlay").attr("x", width / 2).attr("y", height / 2)
        .attr("text-anchor", "middle").attr("fill", "#5d6a64").attr("font-size", 14)
        .call(text => {
          text.selectAll("tspan").remove();
          text.append("tspan").attr("x", width / 2).attr("dy", "-0.15em").text("National summary only");
          text.append("tspan").attr("x", width / 2).attr("dy", "1.35em").text("No state-level education estimates published");
        });
    } else {
      svg.selectAll("text.map-overlay").remove();
    }
    updateLinkedState();
  }

  function drawDotPlot(isEducation) {
    const container = d3.select("#dotplot");
    const rows = (isEducation ? allData.filter(d => d.characteristic === "Education") : currentRows.filter(d => !TERRITORIES.has(d.state)))
      .slice().sort((a, b) => d3.descending(a.prevalence ?? -1, b.prevalence ?? -1));
    const width = Math.max(320, container.node().clientWidth || 380);
    const margin = {top: 34, right: 38, bottom: 20, left: isEducation ? 205 : 110};
    const rowHeight = isEducation ? 42 : 24;
    const height = margin.top + margin.bottom + rows.length * rowHeight;
    const xDomain = isEducation ? [20, 45] : COLOR_DOMAIN;
    const x = d3.scaleLinear().domain(xDomain).range([margin.left, width - margin.right]);
    const y = d3.scaleBand().domain(rows.map(d => d.state_abbr === "US" ? d.group : d.state)).range([margin.top, height - margin.bottom]).padding(.18);

    const svg = container.selectAll("svg").data([null]).join("svg")
      .attr("width", width).attr("height", height)
      .attr("viewBox", `0 0 ${width} ${height}`);
    svg.selectAll("g.axis").data([null]).join("g").attr("class", "axis")
      .attr("transform", `translate(0,${margin.top - 8})`)
      .call(d3.axisTop(x).ticks(5).tickFormat(d => `${d}%`).tickSizeOuter(0));

    const row = svg.selectAll("g.dot-row").data(rows, d => d.state + d.group)
      .join(enter => {
        const g = enter.append("g").attr("class", "dot-row");
        g.append("line").attr("class", "guide");
        g.append("text").attr("class", "label").attr("text-anchor", "end").attr("dominant-baseline", "middle");
        g.append("circle").attr("class", "dot").attr("r", 5);
        g.append("text").attr("class", "value").attr("dominant-baseline", "middle");
        return g;
      });

    row.attr("transform", d => `translate(0,${y(isEducation ? d.group : d.state) + y.bandwidth() / 2})`)
      .attr("tabindex", 0)
      .on("pointerenter focus", (event, d) => {
        hoveredState = isEducation ? null : d.state;
        updateLinkedState();
        showTooltip(event, d, false);
      })
      .on("pointermove", moveTooltip)
      .on("pointerleave blur", () => { hoveredState = null; updateLinkedState(); hideTooltip(); })
      .on("click keydown", (event, d) => {
        if (isEducation || (event.type === "keydown" && !["Enter", " "].includes(event.key))) return;
        selectedState = selectedState === d.state ? null : d.state;
        updateLinkedState();
        renderSelectedDetail();
      });

    row.select("line.guide").attr("x1", margin.left).attr("x2", width - margin.right).attr("y1", 0).attr("y2", 0);
    row.select("text.label").attr("x", margin.left - 8).text(d => isEducation ? educationDisplayLabel(d.group) : d.state_abbr);
    row.select("circle.dot")
      .attr("cx", d => d.prevalence == null ? x(xDomain[0]) : x(d.prevalence))
      .attr("fill", d => d.prevalence == null ? "#bbb" : color(d.prevalence))
      .attr("opacity", d => d.prevalence == null ? .55 : 1);
    row.select("text.value")
      .attr("x", d => d.prevalence == null ? x(xDomain[0]) + 9 : Math.min(width - 32, x(d.prevalence) + 9))
      .text(d => d.prevalence == null ? "N/A" : `${d.prevalence.toFixed(1)}%`);
    updateLinkedState();
  }

  function drawLegend() {
    const width = 250, height = 34;
    const svg = d3.select("#legend").append("svg").attr("width", width).attr("height", height);
    const defs = svg.append("defs");
    const gradient = defs.append("linearGradient").attr("id", "legend-gradient");
    d3.range(0, 1.01, .1).forEach(t => gradient.append("stop").attr("offset", `${t * 100}%`).attr("stop-color", color(COLOR_DOMAIN[0] + t * (COLOR_DOMAIN[1] - COLOR_DOMAIN[0]))));
    svg.append("rect").attr("x", 1).attr("y", 1).attr("width", width - 2).attr("height", 10).attr("rx", 3).attr("fill", "url(#legend-gradient)");
    svg.append("text").attr("x", 1).attr("y", 29).text(`${COLOR_DOMAIN[0]}%`);
    svg.append("text").attr("x", width - 1).attr("y", 29).attr("text-anchor", "end").text(`${COLOR_DOMAIN[1]}%+`);
    svg.append("text").attr("x", width / 2).attr("y", 29).attr("text-anchor", "middle").text("Adult obesity prevalence");
  }

  function drawTerritories(isEducation) {
    const rows = isEducation ? [] : currentRows.filter(d => TERRITORIES.has(d.state));
    d3.select("#territory-cards").selectAll("div.territory-card").data(rows, d => d.state)
      .join("div").attr("class", "territory-card")
      .html(d => `<span>${d.state}</span><strong>${d.prevalence == null ? "Unavailable" : `${d.prevalence.toFixed(1)}%`}</strong>`);
  }

  function updateLinkedState() {
    d3.selectAll(".state")
      .classed("is-selected", d => rowForFeature(d)?.state === selectedState)
      .classed("is-hovered", d => rowForFeature(d)?.state === hoveredState);
    d3.selectAll(".dot-row")
      .classed("is-selected", d => d.state === selectedState)
      .classed("is-hovered", d => d.state === hoveredState);
  }

  function rowForFeature(feature) {
    const fips = String(feature.id).padStart(2, "0");
    return currentRows.find(d => d.state_fips === fips);
  }

  function renderSelectedDetail() {
    if (!selectedState) {
      selectedDetail.html('<span class="detail-placeholder">Select a state to keep its value in view.</span>');
      return;
    }
    const row = currentRows.find(d => d.state === selectedState);
    if (!row) return;
    const value = row.prevalence == null ? "Estimate unavailable / suppressed" : `${row.prevalence.toFixed(1)}%`;
    const ci = row.ci_low != null ? ` · 95% CI ${row.ci_low.toFixed(1)}–${row.ci_high.toFixed(1)}%` : "";
    selectedDetail.html(`<strong>${row.state}: ${value}</strong>${ci}<br><span>${row.group} · ${row.period_label}</span>`);
  }

  function showTooltip(event, row, educationUnavailable) {
    if (!row) {
      tooltip.html(`<strong>Estimate unavailable</strong><span>${educationUnavailable ? "State education estimates are not published on the current CDC page." : "No matching observation."}</span>`);
    } else {
      const value = row.prevalence == null ? "Estimate unavailable / suppressed" : `${row.prevalence.toFixed(1)}%`;
      const ci = row.ci_low != null ? `<span>95% CI: ${row.ci_low.toFixed(1)}–${row.ci_high.toFixed(1)}%</span>` : "";
      tooltip.html(`<strong>${row.state === "United States" ? row.group : row.state}</strong><span>${value}</span>${ci}<span>${row.group}</span><span>${row.period_label}</span>`);
    }
    tooltip.classed("visible", true);
    moveTooltip(event);
  }

  function moveTooltip(event) {
    if (!event?.clientX) return;
    const node = tooltip.node();
    const x = Math.min(window.innerWidth - node.offsetWidth - 18, event.clientX + 12);
    const y = Math.min(window.innerHeight - node.offsetHeight - 18, event.clientY + 12);
    tooltip.style("left", `${x}px`).style("top", `${y}px`);
  }

  function hideTooltip() { tooltip.classed("visible", false); }

  function ariaLabel(row) {
    if (!row) return "State with no published estimate";
    return `${row.state}: ${row.prevalence == null ? "estimate unavailable or suppressed" : `${row.prevalence.toFixed(1)} percent`}, ${row.group}, ${row.period_label}`;
  }

  function educationDisplayLabel(group) {
    const labels = {
      "Adults without a high school diploma or equivalent": "No high school diploma",
      "Adults with a high school diploma or equivalent": "High school diploma",
      "Adults with some college education": "Some college",
      "College graduates": "College graduate"
    };
    return labels[group] || group;
  }

  function debounce(fn, wait) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), wait); };
  }
})();
