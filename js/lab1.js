const chart = d3.select("#chart");

async function drawChart() {
  try {
    const data = await d3.csv("../data/students.csv", d => ({
      name: d.name,
      score: +d.score
    }));

    chart.selectAll("*").remove();

    const width = 940;
    const height = 460;
    const margin = { top: 20, right: 20, bottom: 80, left: 20 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const x = d3.scaleBand()
      .domain(data.map(d => d.name))
      .range([0, innerWidth])
      .padding(0.25);

    const y = d3.scaleLinear()
      .domain([0, 100])
      .range([innerHeight, 0]);

    const svg = chart.append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("role", "img")
      .attr("aria-labelledby", "chart-title chart-description");

    svg.append("title").attr("id", "chart-title").text("Student Scores");
    svg.append("desc").attr("id", "chart-description")
      .text("A bar chart showing the scores of eight students. Taller bars represent higher scores.");

    const plot = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    plot.append("line")
      .attr("class", "baseline")
      .attr("x1", 0)
      .attr("x2", innerWidth)
      .attr("y1", innerHeight)
      .attr("y2", innerHeight);

    plot.selectAll("rect")
      .data(data)
      .join("rect")
      .attr("class", "bar")
      .attr("x", d => x(d.name))
      .attr("y", d => y(d.score))
      .attr("width", x.bandwidth())
      .attr("height", d => innerHeight - y(d.score));

    const labels = plot.selectAll("g.student-label")
      .data(data)
      .join("g")
      .attr("class", "student-label")
      .attr("transform", d => `translate(${x(d.name) + x.bandwidth() / 2},${innerHeight + 25})`);

    labels.append("text")
      .attr("class", "student-name")
      .attr("text-anchor", "middle")
      .text(d => d.name);

    labels.append("text")
      .attr("class", "student-score")
      .attr("text-anchor", "middle")
      .attr("y", 20)
      .text(d => `Score: ${d.score}`);
  } catch (error) {
    console.error("Unable to load student data:", error);
    chart.html('<p class="error">The chart could not load. Please view this page through a web server.</p>');
  }
}

drawChart();
