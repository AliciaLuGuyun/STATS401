const tooltip = d3.select("#tooltip");
const formatDate = d3.timeFormat("%Y-%m-%d");
const money = d3.format("$,.0f");

Promise.all([
  d3.csv("../data/lab7_assignment_companies.csv", d => ({
    id: d.id,
    company_name: d.company_name,
    sector: d.sector,
    region: d.region
  })),
  d3.csv("../data/lab7_assignment_transactions_60days.csv", d => ({
    date: d3.timeParse("%Y-%m-%d")(d.date),
    day: +d.day,
    source: d.source,
    target: d.target,
    amount_usd: +d.amount_usd,
    transaction_type: d.transaction_type,
    transaction_count: +d.transaction_count
  }))
]).then(([companies, transactions]) => {
  drawTemporalNetwork(companies, transactions);
}).catch(error => {
  console.error("Unable to build Lab 7:", error);
  d3.select("#data-status").attr("class", "error")
    .text("Unable to load the Lab 7 CSV files. Run an HTTP server and check the console.");
});

function drawTemporalNetwork(companies, transactions) {
  const width = 1000;
  const height = 700;
  const maxDay = 60;
  let currentDay = 1;
  let timer = null;

  const companyById = new Map(companies.map(d => [d.id, d]));
  const datesByDay = new Map(d3.rollups(transactions, v => v[0].date, d => d.day));
  const sectors = [...new Set(companies.map(d => d.sector))];
  const regions = [...new Set(companies.map(d => d.region))];
  const types = [...new Set(transactions.map(d => d.transaction_type))];
  const dailyLinks = d3.group(transactions, d => d.day);
  const maxDailyVolume = d3.max(companies, company =>
    d3.max(d3.range(1, maxDay + 1), day => calculateVolume(company.id, dailyLinks.get(day) || [])));

  const sectorColor = d3.scaleOrdinal().domain(sectors)
    .range(["#4e79a7", "#f28e2b", "#59a14f", "#e15759", "#76b7b2", "#b07aa1"]);
  const typeColor = d3.scaleOrdinal().domain(types)
    .range(["#4e79a7", "#f28e2b", "#59a14f", "#b07aa1", "#e15759"]);
  const regionSymbol = d3.scaleOrdinal().domain(regions)
    .range([d3.symbolCircle, d3.symbolSquare, d3.symbolTriangle]);
  const regionStroke = d3.scaleOrdinal().domain(regions)
    .range(["4,0", "7,3", "2,3"]);
  const radiusScale = d3.scaleSqrt().domain([0, maxDailyVolume]).range([8, 30]);
  const symbolSize = d3.scaleSqrt().domain([8, 30]).range([170, 1250]);
  const amountWidth = d3.scaleSqrt()
    .domain(d3.extent(transactions, d => d.amount_usd)).range([1.5, 7]);
  const countOpacity = d3.scaleLinear()
    .domain(d3.extent(transactions, d => d.transaction_count)).range([0.35, 0.9]);

  companies.forEach((d, i) => {
    const angle = (i / companies.length) * Math.PI * 2;
    d.x = width / 2 + Math.cos(angle) * 220;
    d.y = height / 2 + Math.sin(angle) * 190;
    d.volume = 0;
    d.degree = 0;
  });

  d3.select("#data-status")
    .text(`${companies.length} companies · ${transactions.length} daily transaction records · ${maxDay} days`);

  const svg = d3.select("#network").append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("aria-label", "Animated temporal commercial network");
  svg.append("title").text("Commercial network by day");

  const regionAnchors = new Map([
    ["Asia", { x: width * 0.25, y: height * 0.38 }],
    ["Europe", { x: width * 0.72, y: height * 0.34 }],
    ["North America", { x: width * 0.50, y: height * 0.72 }]
  ]);

  svg.append("g").selectAll("text").data(regions).join("text")
    .attr("class", "region-label")
    .attr("x", d => regionAnchors.get(d).x)
    .attr("y", d => regionAnchors.get(d).y - 125)
    .text(d => d);

  const linkGroup = svg.append("g");
  const linkHitGroup = svg.append("g");
  const nodeGroup = svg.append("g");

  const simulation = d3.forceSimulation(companies)
    .force("link", d3.forceLink().id(d => d.id).distance(105).strength(0.45))
    .force("charge", d3.forceManyBody().strength(-190))
    .force("collision", d3.forceCollide(d => radiusScale(d.volume) + 12))
    .force("x", d3.forceX(d => regionAnchors.get(d.region).x).strength(0.035))
    .force("y", d3.forceY(d => regionAnchors.get(d.region).y).strength(0.035));

  const node = nodeGroup.selectAll("g.company").data(companies, d => d.id).join("g")
    .attr("class", "company")
    .attr("tabindex", 0);
  node.append("path")
    .attr("fill", d => sectorColor(d.sector))
    .attr("stroke", "#222")
    .attr("stroke-width", 2)
    .attr("stroke-dasharray", d => regionStroke(d.region));
  node.append("text")
    .attr("class", "node-label")
    .text(d => d.id.replace("c", ""));

  node.call(d3.drag()
    .on("start", (event, d) => {
      if (!event.active) simulation.alphaTarget(0.25).restart();
      d.fx = d.x;
      d.fy = d.y;
      tooltip.style("opacity", 0);
    })
    .on("drag", (event, d) => {
      d.fx = Math.max(40, Math.min(width - 40, event.x));
      d.fy = Math.max(40, Math.min(height - 40, event.y));
    })
    .on("end", (event, d) => {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }));

  node.on("mouseenter focus", (event, d) => {
    showTooltip(event, `<strong>${d.company_name}</strong><br>Sector: ${d.sector}<br>Region: ${d.region}<br>Day ${currentDay} volume: ${money(d.volume)}<br>Active links: ${d.degree}`);
  }).on("mousemove", moveTooltip)
    .on("mouseleave blur", () => tooltip.style("opacity", 0));

  simulation.on("tick", () => {
    companies.forEach(d => {
      d.x = Math.max(35, Math.min(width - 35, d.x));
      d.y = Math.max(35, Math.min(height - 35, d.y));
    });
    linkGroup.selectAll("line")
      .attr("x1", d => d.source.x).attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x).attr("y2", d => d.target.y);
    linkHitGroup.selectAll("line")
      .attr("x1", d => d.source.x).attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x).attr("y2", d => d.target.y);
    node.attr("transform", d => `translate(${d.x},${d.y})`);
  });

  drawLegend(sectorColor, typeColor, regionSymbol, regionStroke, regions);

  d3.select("#play").on("click", play);
  d3.select("#pause").on("click", pause);
  d3.select("#reset").on("click", reset);
  d3.select("#day-slider").on("input", function() {
    pause();
    showDay(+this.value);
  });

  showDay(1);

  function showDay(day) {
    currentDay = day;
    const currentLinks = (dailyLinks.get(day) || []).map(d => ({ ...d }));
    const activeIds = new Set(currentLinks.flatMap(d => [d.source, d.target]));

    companies.forEach(company => {
      const linked = currentLinks.filter(d => d.source === company.id || d.target === company.id);
      company.volume = d3.sum(linked, d => d.amount_usd);
      company.degree = linked.length;
    });

    const resolvedLinks = currentLinks.map(d => ({
      ...d,
      source: companyById.get(d.source),
      target: companyById.get(d.target)
    }));

    const linkKey = d => `${d.source.id}-${d.target.id}-${d.transaction_type}`;

    linkGroup.selectAll("line").data(resolvedLinks, linkKey).join(
      enter => enter.append("line")
        .attr("class", "link")
        .attr("stroke", d => typeColor(d.transaction_type))
        .attr("stroke-width", d => amountWidth(d.amount_usd))
        .attr("stroke-opacity", 0)
        .attr("stroke-linecap", "round")
        .call(enter => enter.transition().duration(350)
          .attr("stroke-opacity", d => countOpacity(d.transaction_count))),
      update => update.call(update => update.transition().duration(350)
        .attr("stroke", d => typeColor(d.transaction_type))
        .attr("stroke-width", d => amountWidth(d.amount_usd))
        .attr("stroke-opacity", d => countOpacity(d.transaction_count))),
      exit => exit.call(exit => exit.transition().duration(350)
        .attr("stroke-opacity", 0)
        .remove())
    );

    linkHitGroup.selectAll("line").data(resolvedLinks, linkKey).join(
      enter => enter.append("line").attr("class", "link-hit"),
      update => update,
      exit => exit.remove()
    ).on("mouseenter", (event, d) => {
      showTooltip(event, `<strong>${d.source.company_name} ↔ ${d.target.company_name}</strong><br>${formatDate(d.date)} · Day ${d.day}<br>Type: ${d.transaction_type}<br>Amount: ${money(d.amount_usd)}<br>Transactions: ${d.transaction_count}`);
    }).on("mousemove", moveTooltip)
      .on("mouseleave", () => tooltip.style("opacity", 0));

    node.select("path").transition().duration(350)
      .attr("d", d => d3.symbol().type(regionSymbol(d.region)).size(symbolSize(radiusScale(d.volume)))())
      .attr("opacity", d => activeIds.has(d.id) ? 1 : 0.28);

    node.select("text").transition().duration(350)
      .attr("opacity", d => activeIds.has(d.id) ? 1 : 0.45);

    simulation.force("link").links(resolvedLinks);
    simulation.force("collision", d3.forceCollide(d => radiusScale(d.volume) + 12));
    simulation.alpha(0.25).restart();

    updateSummary(day, currentLinks, activeIds);
    d3.select("#day-slider").property("value", day);
    d3.select("#current-date").text(`Day ${day} · ${formatDate(datesByDay.get(day))}`);
  }

  function play() {
    if (timer) return;
    timer = d3.interval(() => {
      const nextDay = currentDay >= maxDay ? 1 : currentDay + 1;
      showDay(nextDay);
    }, 900);
  }

  function pause() {
    if (timer) {
      timer.stop();
      timer = null;
    }
  }

  function reset() {
    pause();
    showDay(1);
  }

  function updateSummary(day, links, activeIds) {
    const totalValue = d3.sum(links, d => d.amount_usd);
    const crossRegional = links.filter(d => companyById.get(d.source).region !== companyById.get(d.target).region).length;
    const topCompany = d3.greatest(companies, d => d.volume);
    d3.select("#daily-summary").html(`
      <span><strong>Day:</strong> ${day}</span>
      <span><strong>Date:</strong> ${formatDate(datesByDay.get(day))}</span>
      <span><strong>Active companies:</strong> ${activeIds.size}</span>
      <span><strong>Active links:</strong> ${links.length}</span>
      <span><strong>Total value:</strong> ${money(totalValue)}</span>
      <span><strong>Cross-regional links:</strong> ${crossRegional}</span>
      <span><strong>Top company:</strong> ${topCompany.company_name} (${money(topCompany.volume)})</span>
    `);
  }
}

function calculateVolume(companyId, links) {
  return d3.sum(links.filter(d => d.source === companyId || d.target === companyId), d => d.amount_usd);
}

function drawLegend(sectorColor, typeColor, regionSymbol, regionStroke, regions) {
  const legend = d3.select("#legend");

  const sectors = legend.append("div").attr("class", "legend-section");
  sectors.append("h3").text("Nodes");
  sectorColor.domain().forEach(sector => {
    sectors.append("div").attr("class", "legend-item")
      .html(`<span class="legend-swatch" style="background:${sectorColor(sector)}"></span>${sector} sector`);
  });
  sectors.append("div").attr("class", "legend-item").text("Size = current-day transaction volume");

  const regionBox = legend.append("div").attr("class", "legend-section");
  regionBox.append("h3").text("Regions");
  const regionSvg = regionBox.append("svg").attr("width", 205).attr("height", regions.length * 28);
  const rows = regionSvg.selectAll("g").data(regions).join("g")
    .attr("transform", (d, i) => `translate(14,${18 + i * 28})`);
  rows.append("path")
    .attr("d", d => d3.symbol().type(regionSymbol(d)).size(130)())
    .attr("fill", "#fff")
    .attr("stroke", "#222")
    .attr("stroke-width", 2)
    .attr("stroke-dasharray", d => regionStroke(d));
  rows.append("text").attr("x", 20).attr("y", 4).text(d => d);

  const links = legend.append("div").attr("class", "legend-section");
  links.append("h3").text("Links");
  typeColor.domain().forEach(type => {
    links.append("div").attr("class", "legend-item")
      .html(`<span class="legend-line" style="border-color:${typeColor(type)}"></span>${type}`);
  });
  links.append("div").attr("class", "legend-item").text("Width = amount, opacity = count");
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
