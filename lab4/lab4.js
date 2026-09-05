const colors = {
  Negative: "#c44e52",
  Neutral: "#999999",
  Positive: "#4c9f70"
};

d3.csv("../data/lab4_sentiment_by_airline.csv", row => ({
  airline: row.airline,
  sentiment: row.sentiment,
  count: +row.count,
  percentage: +row.percentage
})).then(data => {
  const sentiments = ["Negative", "Neutral", "Positive"];
  const airlines = Array.from(new Set(data.map(row => row.airline))).sort();
  const lookup = d3.group(data, row => row.airline);
  const chartData = airlines.map(airline => {
    const record = { airline };
    const rows = lookup.get(airline) || [];
    sentiments.forEach(sentiment => {
      record[sentiment] = rows.find(row => row.sentiment === sentiment)?.percentage || 0;
    });
    return record;
  });

  const width = 820;
  const height = 420;
  const margin = { top: 25, right: 30, bottom: 70, left: 70 };
  const x = d3.scaleBand().domain(airlines)
    .range([margin.left, width - margin.right]).padding(0.25);
  const y = d3.scaleLinear().domain([0, 100])
    .range([height - margin.bottom, margin.top]);

  const svg = d3.select("#sentiment-chart").append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("role", "img")
    .attr("aria-label", "Stacked bar chart of estimated tweet sentiment by airline");

  svg.append("g").attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x)).selectAll("text")
    .attr("transform", "rotate(-20)").style("text-anchor", "end");
  svg.append("g").attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(5).tickFormat(value => `${value}%`));

  const series = d3.stack().keys(sentiments)(chartData);
  svg.selectAll("g.sentiment-series").data(series).join("g")
    .attr("class", "sentiment-series")
    .attr("fill", layer => colors[layer.key])
    .selectAll("rect")
    .data(layer => layer.map(segment => ({ ...segment, key: layer.key })))
    .join("rect")
    .attr("x", segment => x(segment.data.airline))
    .attr("y", segment => y(segment[1]))
    .attr("height", segment => y(segment[0]) - y(segment[1]))
    .attr("width", x.bandwidth())
    .append("title")
    .text(segment => `${segment.data.airline}: ${segment.key} ${(segment[1] - segment[0]).toFixed(1)}%`);

  d3.select("#chart-legend").selectAll("span").data(sentiments).join("span")
    .html(sentiment => `<i style="background:${colors[sentiment]}"></i>${sentiment}`);
}).catch(error => {
  console.error("Unable to load Lab 4 data:", error);
  d3.select("#sentiment-chart")
    .html('<p class="error">Unable to load the sentiment data.</p>');
});
