const numericColumns = new Set(["year", "data_value"]);

d3.csv("../data/lab3_health_data.csv")
  .then(data => {
    data.forEach(row => {
      row.data_value = Number(row.data_value);
    });

    drawHealthChart(data);

    const columns = data.columns;
    const filterColumns = new Set(["category", "stateabbr"]);
    let filteredData = data;
    let selectedColumn = null;
    let ascending = true;

    addFilter("#table-category-filter", "category", "All categories");
    addFilter("#table-state-filter", "stateabbr", "All states");

    const table = d3.select("#data-table");

    const headerCells = table
      .select("thead")
      .append("tr")
      .selectAll("th")
      .data(columns)
      .join("th")
      .attr("tabindex", column => filterColumns.has(column) ? null : 0)
      .attr("role", column => filterColumns.has(column) ? null : "button")
      .text(column => column)
      .on("click", (event, column) => {
        if (!filterColumns.has(column)) sortTable(column);
      })
      .on("keydown", (event, column) => {
        if (!filterColumns.has(column) && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          sortTable(column);
        }
      });

    function addFilter(selector, column, allLabel) {
      const values = Array.from(new Set(data.map(row => row[column]))).sort();
      d3.select(selector)
        .selectAll("option")
        .data(["", ...values])
        .join("option")
        .attr("value", value => value)
        .text(value => value || allLabel);

      d3.select(selector).on("change", applyFilters);
    }

    function applyFilters() {
      const category = d3.select("#table-category-filter").property("value");
      const state = d3.select("#table-state-filter").property("value");

      filteredData = data.filter(row =>
        (!category || row.category === category) &&
        (!state || row.stateabbr === state)
      );

      if (selectedColumn) sortCurrentData();
      updateRows();
    }

    function sortTable(column) {
      if (selectedColumn === column) {
        ascending = !ascending;
      } else {
        selectedColumn = column;
        ascending = true;
      }

      sortCurrentData();

      headerCells.text(name => {
        if (name !== selectedColumn) {
          return name;
        }

        return `${name} ${ascending ? "▲" : "▼"}`;
      });

      updateRows();
    }

    function sortCurrentData() {
      filteredData.sort((a, b) => {
        let first = a[column] ?? "";
        let second = b[column] ?? "";

        if (numericColumns.has(column)) {
          first = Number(first);
          second = Number(second);
        } else {
          first = first.toLowerCase();
          second = second.toLowerCase();
        }

        return ascending
          ? d3.ascending(first, second)
          : d3.descending(first, second);
      });

    }

    function updateRows() {
      const rows = table
        .select("tbody")
        .selectAll("tr")
        .data(filteredData)
        .join("tr");

      rows.selectAll("td")
        .data(row => columns.map(column => row[column]))
        .join("td")
        .text(value => value);

      d3.select("#visible-records")
        .text(`${filteredData.length} records shown`);
    }

    updateRows();
  })
  .catch(error => {
    console.error("Unable to load Lab 3 data:", error);

    d3.select(".table-container")
      .html('<p class="error">Unable to load the health dataset.</p>');
  });

function drawHealthChart(data) {
  const categories = Array.from(new Set(data.map(row => row.category))).sort();
  const select = d3.select("#category-select");

  select
    .selectAll("option")
    .data(categories)
    .join("option")
    .attr("value", category => category)
    .text(category => category);

  select.on("change", event => updateChart(event.target.value));
  updateChart(categories[0]);

  function updateChart(category) {
    const summary = d3.rollups(
      data.filter(row => row.category === category),
      values => d3.mean(values, row => row.data_value),
      row => row.measure
    )
      .map(([measure, value]) => ({ measure, value }))
      .sort((a, b) => d3.descending(a.value, b.value))
      .slice(0, 10);

    const width = 760;
    const margin = { top: 15, right: 55, bottom: 35, left: 260 };
    const height = margin.top + margin.bottom + summary.length * 36;

    const x = d3.scaleLinear()
      .domain([0, d3.max(summary, item => item.value) || 0])
      .nice()
      .range([margin.left, width - margin.right]);

    const y = d3.scaleBand()
      .domain(summary.map(item => item.measure))
      .range([margin.top, height - margin.bottom])
      .padding(0.25);

    const svg = d3.select("#health-chart")
      .html("")
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("role", "img")
      .attr("aria-label", `Average percentages for ${category}`);

    svg.append("g")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat(value => `${value}%`));

    svg.append("g")
      .attr("transform", `translate(${margin.left},0)`)
      .call(d3.axisLeft(y));

    svg.selectAll(".health-bar")
      .data(summary)
      .join("rect")
      .attr("class", "health-bar")
      .attr("x", margin.left)
      .attr("y", item => y(item.measure))
      .attr("width", item => x(item.value) - margin.left)
      .attr("height", y.bandwidth());

    svg.selectAll(".health-value")
      .data(summary)
      .join("text")
      .attr("class", "health-value")
      .attr("x", item => x(item.value) + 5)
      .attr("y", item => y(item.measure) + y.bandwidth() / 2)
      .attr("dominant-baseline", "middle")
      .text(item => `${item.value.toFixed(1)}%`);
  }
}
