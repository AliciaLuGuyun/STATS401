# CDC Adult Obesity Prevalence Maps — D3 Critique and Redesign

This project redesigns the CDC’s current **2025 Adult Obesity Prevalence Maps** as one demographic explorer with a stable U.S. map and a linked sorted dot plot.

## Preview locally

From this directory, run:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>. A web server is required because the page loads external CSV and JSON files.

## Visualization architecture

- **Primary view:** a U.S. choropleth that updates when the characteristic or subgroup changes.
- **Comparison view:** a sorted dot plot using aligned position for state ranking and exact comparison.
- **Interaction:** linked hover, persistent click selection, exact-value tooltips, responsive controls.
- **Provenance:** the active BRFSS period remains visible. Race/ethnicity estimates are explicitly marked as pooled 2023–2025 data.
- **Territories:** Guam, Puerto Rico, and the U.S. Virgin Islands remain in the dataset and appear as compact cards because the main state geometry covers the 50 states and DC.

## Data provenance

All state and territory values are copied programmatically from nine official CSV downloads linked by the [CDC Adult Obesity Prevalence Maps](https://www.cdc.gov/obesity/data-and-statistics/adult-obesity-prevalence-maps.html) page. The raw files are preserved in `data/raw/` and their exact URLs are recorded in `data/source_manifest.json`.

| Characteristic | Groups | Period |
|---|---|---|
| Overall | All adults | BRFSS 2025 |
| Age | 18–39; 40–59; 60 years and older | BRFSS 2025 |
| Race/Ethnicity | Non-Hispanic Asian; Non-Hispanic White; Hispanic; Non-Hispanic American Indian or Alaska Native; Non-Hispanic Black adults | BRFSS 2023–2025 pooled |
| Education | Without high school diploma/equivalent; high school diploma/equivalent; some college; college graduates | BRFSS 2025, national summary only |

### Education audit finding

The current CDC page reports four **national** education estimates, but it does not currently publish state-level education maps or downloadable state tables. The redesign therefore does not fabricate state education values. Selecting Education mutes the map and displays the four national values in the quantitative view with an explanatory notice.

## Transformations

`scripts/process_data.py`:

1. reads the nine source CSVs without manually transcribing values;
2. maps jurisdiction names to abbreviations and FIPS codes;
3. parses prevalence and confidence-interval fields;
4. converts `Insufficient data*` to a blank numeric value with `suppressed=true`;
5. attaches characteristic, subgroup, period, and source metadata;
6. appends the four national education summaries published on the current page;
7. writes `data/obesity_prevalence.csv`.

Run it with:

```bash
python3 scripts/process_data.py
```

## Color decision

The original CDC map uses eight discrete bins: `<20%`, `20–<25%`, `25–<30%`, `30–<35%`, `35–<40%`, `40–<45%`, `45–<50%`, and `50%+`.

Those bins make broad public-health categories easy to describe and support direct threshold counting. They also hide within-bin differences and visually exaggerate small differences that cross a threshold. The redesign uses one fixed continuous sequential scale from 10% to 55% across every mapped subgroup. This preserves the intuitive “more prevalence → more visual intensity” mapping and keeps colors comparable when users switch groups. The linked dot plot and tooltip carry precise comparison, rather than asking color to do that job.

## Critique-to-redesign mapping

1. **Repeated maps require scrolling and memory.** One persistent map with selectors keeps the geographic frame stable.
2. **Cross-group exploration is cumbersome.** Characteristic and subgroup controls update the same views while keeping the active period visible.
3. **Choropleths are weak for exact comparison and give large states more visual salience.** A linked sorted dot plot uses aligned position and exact labels.

Preserved strengths include geographic context, familiar state placement, an ordered prevalence encoding, and visible suppression/provenance information.

## Missing and suppressed estimates

CDC marks an estimate as insufficient when the sample size is below 50, the relative standard error is at least 30%, or no data are available for the period. These records remain in the tidy dataset with blank prevalence and `suppressed=true`. The visualization shows them with a patterned neutral fill and the text “Estimate unavailable / suppressed,” never as zero.

## Remaining limitations

- BRFSS height and weight are self-reported.
- Values are survey estimates and include sampling uncertainty.
- Some state/subgroup estimates are suppressed.
- Race/ethnicity data pool 2023–2025 and should not be treated as the identical period as the 2025 overall and age estimates.
- Area bias remains inherent in the choropleth, although the linked ranking reduces its effect on comparison.
- Education is national-only because the current source page does not provide state tables.
- The available demographic categories are those published by CDC and do not represent every possible identity.

## GitHub Pages integration

The project is self-contained and uses relative paths. Either:

1. copy the entire `STATS401---Adult-Obesity-Redesign/` directory into the course repository and link to its `index.html`; or
2. copy its contents into the desired project-page directory.

Keep `data/`, `js/`, `css/`, and `assets/` beside `index.html`. No build tool or server-side code is required.
