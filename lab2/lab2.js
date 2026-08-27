const width = 960;
const height = 620;
const margin = { top: 80, right: 40, bottom: 45, left: 90 };

const tooltip = d3.select("#tooltip");

d3.csv("../data/cities_multivariate.csv", d => ({
  city: d.city,
  population: +d.population,
  temp_c: +d.temp_c,
  development_level: d.development_level,
  region: d.region
}))
  .then(drawChart)
  .catch(error => {
    console.error("Unable to load city data:", error);
    d3.select("#chart").html('<p class="error">Unable to load the city data.</p>');
  });

function drawChart(data) {
  d3.select("#chart").selectAll("*").remove();

  const populationStart = margin.left;
  const populationEnd = 410;
  const temperatureStart = 560;
  const temperatureEnd = width - margin.right;

  const yScale = d3.scaleBand()
    .domain(data.map(d => d.city))
    .range([margin.top, height - margin.bottom])
    .padding(0.3);

  const populationScale = d3.scaleLinear()
    .domain([0, d3.max(data, d => d.population)])
    .nice()
    .range([populationStart, populationEnd]);

  const temperatureScale = d3.scaleLinear()
    .domain(d3.extent(data, d => d.temp_c))
    .nice()
    .range([temperatureStart, temperatureEnd]);

  const colorScale = d3.scaleOrdinal()
    .domain(["North", "South", "East", "West"])
    .range(d3.schemeTableau10);

  const sizeScale = d3.scaleOrdinal()
    .domain(["Low", "Medium", "High"])
    .range([5, 8, 11]);

  const svg = d3.select("#chart")
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("role", "img")
    .attr("aria-label", "City population and temperature chart");

  svg.append("g")
    .attr("transform", `translate(0, ${margin.top - 15})`)
    .call(d3.axisTop(populationScale).ticks(5));

  svg.append("g")
    .attr("transform", `translate(0, ${margin.top - 15})`)
    .call(d3.axisTop(temperatureScale).ticks(5));

  svg.append("text")
    .attr("x", (populationStart + populationEnd) / 2)
    .attr("y", 25)
    .attr("text-anchor", "middle")
    .attr("font-weight", "bold")
    .text("Population (millions)");

  svg.append("text")
    .attr("x", (temperatureStart + temperatureEnd) / 2)
    .attr("y", 25)
    .attr("text-anchor", "middle")
    .attr("font-weight", "bold")
    .text("Average Temperature (°C)");

  svg.append("g")
    .attr("transform", `translate(${margin.left}, 0)`)
    .call(d3.axisLeft(yScale).tickSize(0))
    .call(g => g.select(".domain").remove());

  svg.selectAll(".population-bar")
    .data(data)
    .join("rect")
    .attr("class", "population-bar")
    .attr("x", populationStart)
    .attr("y", d => yScale(d.city))
    .attr("width", d => populationScale(d.population) - populationStart)
    .attr("height", yScale.bandwidth())
    .attr("fill", d => colorScale(d.region))
    .attr("opacity", 0.75);

  const points = svg.selectAll(".temperature-point")
    .data(data)
    .join("circle")
    .attr("class", "temperature-point")
    .attr("cx", d => temperatureScale(d.temp_c))
    .attr("cy", d => yScale(d.city) + yScale.bandwidth() / 2)
    .attr("r", d => sizeScale(d.development_level))
    .attr("fill", d => colorScale(d.region))
    .attr("stroke", "#333");

  points
    .on("mouseover", function(event, d) {
      tooltip
        .style("opacity", 1)
        .html(`<strong>${d.city}</strong><br>Population: ${d.population} million<br>Temperature: ${d.temp_c}°C<br>Development: ${d.development_level}<br>Region: ${d.region}`);
    })
    .on("mousemove", function(event) {
      tooltip
        .style("left", `${event.pageX + 10}px`)
        .style("top", `${event.pageY + 10}px`);
    })
    .on("mouseout", function() {
      tooltip.style("opacity", 0);
    });

  const developmentLevels = sizeScale.domain();
  const developmentLegend = svg.append("g")
    .attr("transform", `translate(${populationStart}, ${height - 20})`);

  developmentLegend.append("text")
    .attr("x", 0)
    .attr("y", 4)
    .attr("font-weight", "bold")
    .text("Development:");

  const developmentItems = developmentLegend.selectAll(".development-item")
    .data(developmentLevels)
    .join("g")
    .attr("class", "development-item")
    .attr("transform", (d, i) => `translate(${105 + i * 75}, 0)`);

  developmentItems.append("circle")
    .attr("r", d => sizeScale(d))
    .attr("fill", "#777")
    .attr("stroke", "#333");

  developmentItems.append("text")
    .attr("x", 15)
    .attr("y", 4)
    .text(d => d);

  const regions = colorScale.domain();
  const legend = svg.append("g")
    .attr("transform", `translate(${temperatureStart}, ${height - 20})`);

  legend.append("text")
    .attr("x", 0)
    .attr("y", 4)
    .attr("font-weight", "bold")
    .text("Region:");

  const legendItems = legend.selectAll(".legend-item")
    .data(regions)
    .join("g")
    .attr("class", "legend-item")
    .attr("transform", (d, i) => `translate(${60 + i * 80}, 0)`);

  legendItems.append("circle")
    .attr("r", 6)
    .attr("fill", d => colorScale(d));

  legendItems.append("text")
    .attr("x", 10)
    .attr("y", 4)
    .text(d => d);
}
