const tooltip = d3.select("#tooltip");
const fmt = d3.format(",");
const pct = d3.format(".0%");

Promise.all([
  d3.csv("data/lab8_embedding_map.csv", d => ({
    ...d,
    page: +d.page,
    word_count: +d.word_count,
    cluster: +d.cluster,
    x: +d.x,
    y: +d.y
  })),
  d3.csv("data/lab8_topic_section_matrix.csv", d => ({
    section: d.section,
    cluster_name: d.cluster_name,
    count: +d.count,
    section_total: +d.section_total,
    proportion: +d.proportion
  })),
  d3.csv("data/lab8_neighbors.csv", d => ({
    passage_id: d.passage_id,
    neighbor_rank: +d.neighbor_rank,
    neighbor_id: d.neighbor_id,
    similarity: +d.similarity
  })),
  d3.json("data/extraction_audit.json"),
  d3.json("data/cluster_audit.json"),
  d3.json("data/lab8_dashboard_stats.json")
]).then(([passages, matrix, neighbors, extraction, clusterAudit, stats]) => {
  buildLab(passages, matrix, neighbors, extraction, clusterAudit, stats);
}).catch(error => {
  console.error("Unable to load Lab 8 data:", error);
  d3.select("#match-count").attr("class", "error").text("Unable to load Lab 8 data. Serve the page over HTTP and check the console.");
});

function buildLab(passages, matrix, neighbors, extraction, clusterAudit, stats) {
  const byId = new Map(passages.map(d => [d.passage_id, d]));
  const neighborsById = d3.group(neighbors, d => d.passage_id);
  const topics = [...new Set(passages.map(d => d.cluster_name))];
  const sections = [...new Set(passages.map(d => d.section))].sort((a, b) => d3.ascending(a, b));
  const color = d3.scaleOrdinal().domain(topics).range(d3.schemeTableau10);

  let selectedId = null;
  let matrixSelection = null;
  const state = { search: "", topic: "", section: "" };

  drawStats(extraction, clusterAudit);
  drawOverview(stats, color);
  setupControls(topics, sections);
  drawLegend(topics, color);
  const mapApi = drawMap();
  const matrixApi = drawMatrix();
  updateAll();

  function setupControls(topicList, sectionList) {
    d3.select("#topic-filter").selectAll("option.topic-option")
      .data(topicList).join("option")
      .attr("class", "topic-option")
      .attr("value", d => d)
      .text(d => d);

    d3.select("#section-filter").selectAll("option.section-option")
      .data(sectionList).join("option")
      .attr("class", "section-option")
      .attr("value", d => d)
      .text(d => d);

    d3.select("#search-input").on("input", event => {
      state.search = event.target.value.trim().toLowerCase();
      updateAll();
    });
    d3.select("#topic-filter").on("change", event => {
      state.topic = event.target.value;
      updateAll();
    });
    d3.select("#section-filter").on("change", event => {
      state.section = event.target.value;
      updateAll();
    });
    d3.select("#reset-view").on("click", () => mapApi.resetZoom());
    d3.select("#clear-selection").on("click", () => {
      selectedId = null;
      matrixSelection = null;
      d3.select("#search-input").property("value", "");
      d3.select("#topic-filter").property("value", "");
      d3.select("#section-filter").property("value", "");
      state.search = "";
      state.topic = "";
      state.section = "";
      showDefaultDetails();
      updateAll();
    });
  }

  function matches(d) {
    const searchOk = !state.search || d.text.toLowerCase().includes(state.search);
    const topicOk = !state.topic || d.cluster_name === state.topic;
    const sectionOk = !state.section || d.section === state.section;
    const matrixOk = !matrixSelection || (d.section === matrixSelection.section && d.cluster_name === matrixSelection.cluster_name);
    return searchOk && topicOk && sectionOk && matrixOk;
  }

  function updateAll() {
    const matching = passages.filter(matches);
    const neighborIds = new Set((neighborsById.get(selectedId) || []).map(d => d.neighbor_id));
    d3.select("#match-count").text(`${fmt(matching.length)} matching passages of ${fmt(passages.length)}`);
    mapApi.update(matching, neighborIds);
    matrixApi.update();
  }

  function drawMap() {
    const width = 760;
    const height = 620;
    const margin = 35;
    const x = d3.scaleLinear().domain(d3.extent(passages, d => d.x)).nice().range([margin, width - margin]);
    const y = d3.scaleLinear().domain(d3.extent(passages, d => d.y)).nice().range([height - margin, margin]);
    const r = d3.scaleSqrt().domain(d3.extent(passages, d => d.word_count)).range([3, 11]);

    const svg = d3.select("#semantic-map").append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("aria-label", "UMAP semantic map of bulletin passages");
    svg.append("title").text("UMAP semantic map; proximity indicates semantic similarity");
    const zoomLayer = svg.append("g");
    zoomLayer.append("rect")
      .attr("x", 0).attr("y", 0).attr("width", width).attr("height", height)
      .attr("fill", "transparent");
    const pointLayer = zoomLayer.append("g");

    const zoom = d3.zoom()
      .scaleExtent([0.7, 8])
      .on("zoom", event => zoomLayer.attr("transform", event.transform));
    svg.call(zoom);

    const points = pointLayer.selectAll("circle")
      .data(passages, d => d.passage_id)
      .join("circle")
      .attr("class", "point")
      .attr("cx", d => x(d.x))
      .attr("cy", d => y(d.y))
      .attr("r", d => r(d.word_count))
      .attr("fill", d => color(d.cluster_name))
      .on("click", (event, d) => {
        selectedId = d.passage_id;
        matrixSelection = null;
        showDetails(d);
        updateAll();
      })
      .on("mouseenter", (event, d) => {
        showTooltip(event, `<strong>${d.section}</strong><br>${d.cluster_name}<br>Page ${d.page} · ${d.word_count} words`);
      })
      .on("mousemove", moveTooltip)
      .on("mouseleave", () => tooltip.style("opacity", 0));

    showDefaultDetails();

    return {
      update(matching, neighborIds) {
        const matchIds = new Set(matching.map(d => d.passage_id));
        points
          .classed("dimmed", d => !matchIds.has(d.passage_id))
          .classed("match", d => matchIds.has(d.passage_id))
          .classed("selected", d => d.passage_id === selectedId)
          .classed("neighbor", d => neighborIds.has(d.passage_id))
          .attr("opacity", d => matchIds.has(d.passage_id) ? 0.86 : 0.08);
      },
      resetZoom() {
        svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity);
      }
    };
  }

  function drawMatrix() {
    const shownSections = sections
      .map(section => ({ section, count: passages.filter(d => d.section === section).length }))
      .filter(d => d.count >= 2)
      .sort((a, b) => d3.descending(a.count, b.count) || d3.ascending(a.section, b.section))
      .map(d => d.section);
    const cell = 22;
    const left = 230;
    const top = 165;
    const width = left + topics.length * cell + 30;
    const height = top + shownSections.length * cell + 30;
    const counts = new Map(matrix.map(d => [`${d.section}|||${d.cluster_name}`, d]));
    const maxCount = d3.max(matrix, d => d.count);
    const opacity = d3.scaleLinear().domain([0, maxCount]).range([0.08, 1]);

    const svg = d3.select("#topic-section-matrix").append("svg")
      .attr("width", width)
      .attr("height", height)
      .attr("aria-label", "Topic by bulletin section heatmap");

    svg.append("g").selectAll("text")
      .data(topics).join("text")
      .attr("class", "axis-label")
      .attr("transform", (d, i) => `translate(${left + i * cell + cell / 2},${top - 8}) rotate(-55)`)
      .attr("text-anchor", "start")
      .text(d => d);

    svg.append("g").selectAll("text")
      .data(shownSections).join("text")
      .attr("class", "axis-label")
      .attr("x", left - 8)
      .attr("y", (d, i) => top + i * cell + cell / 2)
      .attr("dy", "0.35em")
      .attr("text-anchor", "end")
      .text(d => d);

    const cells = svg.append("g").selectAll("rect")
      .data(shownSections.flatMap(section => topics.map(topic => {
        const found = counts.get(`${section}|||${topic}`);
        return found || { section, cluster_name: topic, count: 0, proportion: 0 };
      }))).join("rect")
      .attr("class", "matrix-cell")
      .attr("x", d => left + topics.indexOf(d.cluster_name) * cell)
      .attr("y", d => top + shownSections.indexOf(d.section) * cell)
      .attr("width", cell - 1)
      .attr("height", cell - 1)
      .attr("data-section", d => d.section)
      .attr("data-topic", d => d.cluster_name)
      .attr("data-count", d => d.count || 0)
      .attr("fill", d => color(d.cluster_name))
      .attr("fill-opacity", d => d.count ? opacity(d.count) : 0.03)
      .on("click", (event, d) => {
        if (!d.count) return;
        matrixSelection = matrixSelection &&
          matrixSelection.section === d.section &&
          matrixSelection.cluster_name === d.cluster_name ? null : d;
        updateAll();
      })
      .on("mouseenter", (event, d) => {
        showTooltip(event, `<strong>${d.section}</strong><br>${d.cluster_name}<br>${d.count || 0} passages${d.proportion ? `<br>${pct(d.proportion)} of section` : ""}`);
      })
      .on("mousemove", moveTooltip)
      .on("mouseleave", () => tooltip.style("opacity", 0));

    d3.select("#matrix-note").html(`<span class="small-note">Showing ${shownSections.length} sections with at least 2 passages. Counts use all ${fmt(passages.length)} passages.</span>`);

    return {
      update() {
        const selected = selectedId ? byId.get(selectedId) : null;
        cells
          .classed("active", d => matrixSelection && d.section === matrixSelection.section && d.cluster_name === matrixSelection.cluster_name)
          .classed("selected-cell", d => selected && d.section === selected.section && d.cluster_name === selected.cluster_name);
      }
    };
  }

  function showDetails(d) {
    const neighborRows = neighborsById.get(d.passage_id) || [];
    const neighborHtml = neighborRows.map(n => {
      const item = byId.get(n.neighbor_id);
      return `<li><strong>${item.section}</strong> · ${item.cluster_name} · sim ${n.similarity.toFixed(4)}<br>${escapeHtml(item.text.slice(0, 220))}${item.text.length > 220 ? "..." : ""}</li>`;
    }).join("");
    d3.select("#details-panel").html(`
      <h3>${d.passage_id}</h3>
      <p class="details-meta"><strong>${d.cluster_name}</strong><br>
      Chapter: ${escapeHtml(d.chapter || "Unlabeled")}<br>
      Section: ${escapeHtml(d.section || "Unlabeled")}<br>
      Subsection: ${escapeHtml(d.subsection || "None")}<br>
      Page ${d.page} · ${d.word_count} words</p>
      <h4>Passage Text</h4>
      <p>${escapeHtml(d.text)}</p>
      <h4>5 Nearest Semantic Neighbors</h4>
      <ol class="neighbor-list">${neighborHtml}</ol>
    `);
  }

  function showDefaultDetails() {
    d3.select("#details-panel").html(`
      <h3>Selected Passage</h3>
      <p>Click a point to inspect its formal location, semantic topic, full original text, and five nearest neighbors from the original embedding space.</p>
      <p class="small-note">Search and filters fade nonmatching points instead of removing them, so the global semantic layout remains visible.</p>
    `);
  }
}

function drawStats(extraction, clusterAudit) {
  const stats = [
    ["Clean passages", fmt(extraction.clean_passages)],
    ["Chapters", fmt(extraction.chapters)],
    ["Formal sections", fmt(extraction.formal_sections)],
    ["Median words", fmt(extraction.median_passage_words)],
    ["Embedding model", "all-MiniLM-L6-v2"],
    ["Embedding dimension", fmt(clusterAudit.embedding_dimension)]
  ];
  d3.select("#corpus-stats").selectAll("div").data(stats).join("div")
    .attr("class", "stat-card")
    .html(d => `<strong>${d[1]}</strong>${d[0]}`);
}

function drawOverview(stats, color) {
  drawBar("#section-chart", stats.top_sections.slice(0, 12), "section", "count", "#4e79a7");
  drawBar("#topic-chart", stats.topic_counts, "cluster_name", "count", d => color(d.cluster_name));
}

function drawBar(selector, data, labelKey, valueKey, fill) {
  const width = 430;
  const height = Math.max(260, data.length * 24 + 30);
  const margin = { top: 10, right: 20, bottom: 25, left: 170 };
  const svg = d3.select(selector).append("svg").attr("viewBox", `0 0 ${width} ${height}`);
  const y = d3.scaleBand().domain(data.map(d => d[labelKey])).range([margin.top, height - margin.bottom]).padding(0.2);
  const x = d3.scaleLinear().domain([0, d3.max(data, d => d[valueKey])]).nice().range([margin.left, width - margin.right]);
  svg.append("g").selectAll("rect").data(data).join("rect")
    .attr("x", margin.left)
    .attr("y", d => y(d[labelKey]))
    .attr("width", d => x(d[valueKey]) - margin.left)
    .attr("height", y.bandwidth())
    .attr("fill", fill);
  svg.append("g").selectAll("text.label").data(data).join("text")
    .attr("class", "axis-label")
    .attr("x", margin.left - 6)
    .attr("y", d => y(d[labelKey]) + y.bandwidth() / 2)
    .attr("dy", "0.35em")
    .attr("text-anchor", "end")
    .text(d => d[labelKey].length > 28 ? `${d[labelKey].slice(0, 27)}...` : d[labelKey]);
  svg.append("g").selectAll("text.value").data(data).join("text")
    .attr("class", "axis-label")
    .attr("x", d => x(d[valueKey]) + 4)
    .attr("y", d => y(d[labelKey]) + y.bandwidth() / 2)
    .attr("dy", "0.35em")
    .text(d => d[valueKey]);
}

function drawLegend(topics, color) {
  d3.select("#topic-legend").selectAll("span")
    .data(topics).join("span")
    .html(d => `<i style="background:${color(d)}"></i>${d}`);
}

function showTooltip(event, html) {
  tooltip.style("opacity", 1).html(html);
  moveTooltip(event);
}

function moveTooltip(event) {
  tooltip
    .style("left", `${event.pageX + 12}px`)
    .style("top", `${event.pageY + 12}px`);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
