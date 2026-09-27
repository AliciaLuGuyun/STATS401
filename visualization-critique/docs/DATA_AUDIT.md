# Verified data audit

Audit date: 2026-09-27  
Current source page: <https://www.cdc.gov/obesity/data-and-statistics/adult-obesity-prevalence-maps.html>

## Current-page findings

- Overall adult obesity prevalence: **BRFSS 2025**.
- Age-specific prevalence: **BRFSS 2025**.
- Education summary: **BRFSS 2025**.
- Race/ethnicity prevalence: **combined BRFSS 2023–2025**.
- The page states that estimates are unavailable when sample size is below 50, relative standard error is at least 30%, or there are no data for a specific year.
- Each downloadable state table contains `State`, `Prevalence`, and `95% CI`.
- Each downloaded table has 54 jurisdiction rows: 50 states, DC, Guam, Puerto Rico, and the U.S. Virgin Islands.
- The current page says its 2025 maps cover 47 states, DC, Guam, and Puerto Rico. In the files, unavailable jurisdictions remain as explicit `Insufficient data*` records.

## Verified category labels

### Overall

- All adults

### Age

- Adults aged 18–39 years
- Adults aged 40–59 years
- Adults aged 60 years and older

### Education — national only on the current page

- Adults without a high school diploma or equivalent — 38.1%
- Adults with a high school diploma or equivalent — 35.1%
- Adults with some college education — 36.8%
- College graduates — 27.8%

### Race/Ethnicity

- Non-Hispanic Asian adults
- Non-Hispanic White adults
- Hispanic adults
- Non-Hispanic American Indian or Alaska Native adults
- Non-Hispanic Black adults

## Material source-page discrepancy

The project brief anticipated state-level education maps and CSV files. The current 2025 CDC page does not expose such maps or tables: it provides only four national education percentages. State education values were therefore not inferred, manually reconstructed, or substituted from another time period. The interface labels Education as national-only.

## Source manifest

Machine-readable URLs, row counts, periods, groups, and suppressed-row counts are stored in `data/source_manifest.json`.
