# Lab 9 - Geospatial Visualization

## Data provenance

- `../data/lab9_gdp_2025_top50.csv` is the course-provided dataset from the STATS 401 repository. It is preserved unchanged.
- `data/ne_50m_admin_0_countries.geojson` is the Natural Earth 1:50m Admin 0 Countries GeoJSON distributed by the [Natural Earth Vector repository](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_50m_admin_0_countries.geojson). The 1:50m version is used because the coarser 1:110m file omits Singapore and Hong Kong.
- The verified geographic join field is `ADM0_A3`, not `ISO_A3`. It matches all 50 supplied GDP identifiers without duplicates.

## Cartogram implementation

The page vendors `cartogram-chart` 1.2.1, which applies Shawn Allen's implementation of the Dougenik, Chrisman, and Niemeyer contiguous area-cartogram algorithm. `topojson-server` converts the local GeoJSON FeatureCollection into the topology required by the algorithm in the browser. D3 7, cartogram-chart, and topojson-server are vendored with their license files so the page has no runtime CDN dependency.

Countries outside the provided top 50 remain neutral no-data context. The cartogram algorithm requires positive values to retain topology, so those features receive a documented computational floor of 10; this is not displayed or interpreted as GDP. Included economies use their supplied GDP values directly.

## Local preview

From the repository root:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000/lab9/`.
