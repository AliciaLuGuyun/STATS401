#!/usr/bin/env python3
"""Combine the official CDC obesity-map CSVs into one tidy D3-ready file."""

from __future__ import annotations

import csv
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "obesity_prevalence.csv"

STATE_INFO = {
    "Alabama": ("AL", "01"), "Alaska": ("AK", "02"), "Arizona": ("AZ", "04"),
    "Arkansas": ("AR", "05"), "California": ("CA", "06"), "Colorado": ("CO", "08"),
    "Connecticut": ("CT", "09"), "Delaware": ("DE", "10"),
    "District of Columbia": ("DC", "11"), "Florida": ("FL", "12"),
    "Georgia": ("GA", "13"), "Hawaii": ("HI", "15"), "Idaho": ("ID", "16"),
    "Illinois": ("IL", "17"), "Indiana": ("IN", "18"), "Iowa": ("IA", "19"),
    "Kansas": ("KS", "20"), "Kentucky": ("KY", "21"), "Louisiana": ("LA", "22"),
    "Maine": ("ME", "23"), "Maryland": ("MD", "24"), "Massachusetts": ("MA", "25"),
    "Michigan": ("MI", "26"), "Minnesota": ("MN", "27"), "Mississippi": ("MS", "28"),
    "Missouri": ("MO", "29"), "Montana": ("MT", "30"), "Nebraska": ("NE", "31"),
    "Nevada": ("NV", "32"), "New Hampshire": ("NH", "33"), "New Jersey": ("NJ", "34"),
    "New Mexico": ("NM", "35"), "New York": ("NY", "36"), "North Carolina": ("NC", "37"),
    "North Dakota": ("ND", "38"), "Ohio": ("OH", "39"), "Oklahoma": ("OK", "40"),
    "Oregon": ("OR", "41"), "Pennsylvania": ("PA", "42"), "Rhode Island": ("RI", "44"),
    "South Carolina": ("SC", "45"), "South Dakota": ("SD", "46"), "Tennessee": ("TN", "47"),
    "Texas": ("TX", "48"), "Utah": ("UT", "49"), "Vermont": ("VT", "50"),
    "Virginia": ("VA", "51"), "Washington": ("WA", "53"), "West Virginia": ("WV", "54"),
    "Wisconsin": ("WI", "55"), "Wyoming": ("WY", "56"),
    "Puerto Rico": ("PR", "72"), "Guam": ("GU", "66"), "Virgin Islands": ("VI", "78"),
}

SOURCES = [
    ("2_2025-Obesity-by-state.csv", "Overall", "All adults", "2025", "BRFSS 2025"),
    ("3_2025-obesity-by-state-and-aged-18-39.csv", "Age", "Adults aged 18–39 years", "2025", "BRFSS 2025"),
    ("4_2025-obesity-aged-40-59.csv", "Age", "Adults aged 40–59 years", "2025", "BRFSS 2025"),
    ("5_2025-obesity-aged-60.csv", "Age", "Adults aged 60 years and older", "2025", "BRFSS 2025"),
    ("5-Asian.csv", "Race/Ethnicity", "Non-Hispanic Asian adults", "2023–2025", "BRFSS 2023–2025 pooled"),
    ("10_2023-2025_White.csv", "Race/Ethnicity", "Non-Hispanic White adults", "2023–2025", "BRFSS 2023–2025 pooled"),
    ("9_2023-2025_Hispanic.csv", "Race/Ethnicity", "Hispanic adults", "2023–2025", "BRFSS 2023–2025 pooled"),
    ("6_2023-2025-American-Indian-Native-American.csv", "Race/Ethnicity", "Non-Hispanic American Indian or Alaska Native adults", "2023–2025", "BRFSS 2023–2025 pooled"),
    ("8_2023-2025_Black.csv", "Race/Ethnicity", "Non-Hispanic Black adults", "2023–2025", "BRFSS 2023–2025 pooled"),
]

SOURCE_BASE = "https://www.cdc.gov/obesity/media/files/"
SOURCE_URLS = {
    "2_2025-Obesity-by-state.csv": SOURCE_BASE + "2026/09/2_2025-Obesity-by-state.csv",
    "3_2025-obesity-by-state-and-aged-18-39.csv": SOURCE_BASE + "2026/09/3_2025-obesity-by-state-and-aged-18-39.csv",
    "4_2025-obesity-aged-40-59.csv": SOURCE_BASE + "2026/09/4_2025-obesity-aged-40-59.csv",
    "5_2025-obesity-aged-60.csv": SOURCE_BASE + "2026/09/5_2025-obesity-aged-60.csv",
    "5-Asian.csv": SOURCE_BASE + "2025/11/5-Asian.csv",
    "10_2023-2025_White.csv": SOURCE_BASE + "2026/09/10_2023-2025_White.csv",
    "9_2023-2025_Hispanic.csv": SOURCE_BASE + "2026/09/9_2023-2025_Hispanic.csv",
    "6_2023-2025-American-Indian-Native-American.csv": SOURCE_BASE + "2026/09/6_2023-2025-American-Indian-Native-American.csv",
    "8_2023-2025_Black.csv": SOURCE_BASE + "2026/09/8_2023-2025_Black.csv",
}

FIELDS = ["state", "state_abbr", "state_fips", "characteristic", "group", "prevalence",
          "ci_low", "ci_high", "period", "period_label", "suppressed", "geography_scope",
          "source", "source_file"]


def parse_ci(value: str) -> tuple[str, str]:
    if not value or "Insufficient" in value:
        return "", ""
    left, right = value.strip().strip("()").split(",")
    return left.strip(), right.strip()


def main() -> None:
    rows: list[dict[str, str]] = []
    manifest: list[dict[str, object]] = []

    for filename, characteristic, group, period, period_label in SOURCES:
        path = RAW / filename
        source_rows = 0
        suppressed_rows = 0
        with path.open(encoding="utf-8-sig", newline="") as handle:
            for raw in csv.DictReader(handle):
                state = raw["State"].strip()
                if state not in STATE_INFO:
                    raise ValueError(f"Unknown jurisdiction in {filename}: {state}")
                abbr, fips = STATE_INFO[state]
                suppressed = "Insufficient" in raw["Prevalence"]
                ci_low, ci_high = parse_ci(raw["95% CI"])
                rows.append({
                    "state": state,
                    "state_abbr": abbr,
                    "state_fips": fips,
                    "characteristic": characteristic,
                    "group": group,
                    "prevalence": "" if suppressed else raw["Prevalence"].strip(),
                    "ci_low": ci_low,
                    "ci_high": ci_high,
                    "period": period,
                    "period_label": period_label,
                    "suppressed": str(suppressed).lower(),
                    "geography_scope": "State/territory",
                    "source": SOURCE_URLS[filename],
                    "source_file": filename,
                })
                source_rows += 1
                suppressed_rows += int(suppressed)
        manifest.append({
            "filename": filename,
            "source_url": SOURCE_URLS[filename],
            "characteristic": characteristic,
            "group": group,
            "period": period_label,
            "rows": source_rows,
            "suppressed_rows": suppressed_rows,
            "fields": ["State", "Prevalence", "95% CI"],
        })

    # The current CDC page publishes only national education summaries, not state tables.
    education = [
        ("Adults without a high school diploma or equivalent", "38.1"),
        ("Adults with a high school diploma or equivalent", "35.1"),
        ("Adults with some college education", "36.8"),
        ("College graduates", "27.8"),
    ]
    page_url = "https://www.cdc.gov/obesity/data-and-statistics/adult-obesity-prevalence-maps.html"
    for group, value in education:
        rows.append({
            "state": "United States", "state_abbr": "US", "state_fips": "US",
            "characteristic": "Education", "group": group, "prevalence": value,
            "ci_low": "", "ci_high": "", "period": "2025", "period_label": "BRFSS 2025",
            "suppressed": "false", "geography_scope": "National only", "source": page_url,
            "source_file": "CDC page national education summary",
        })

    with OUT.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)

    (ROOT / "data" / "source_manifest.json").write_text(
        json.dumps({
            "visualization_page": page_url,
            "retrieved": "2026-09-27",
            "suppression_rule": "Sample size <50, relative standard error >=30%, or no data in a specific year.",
            "state_level_sources": manifest,
            "education_note": "The current page reports four 2025 national education estimates but does not publish state-level education maps or CSV tables.",
        }, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(rows)} rows to {OUT}")


if __name__ == "__main__":
    main()
