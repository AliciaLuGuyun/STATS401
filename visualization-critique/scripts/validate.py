#!/usr/bin/env python3
"""Structural and spot-check validation for the processed project data."""

from __future__ import annotations

import csv
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "obesity_prevalence.csv"


def load(path: Path):
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


rows = load(DATA)
assert len(rows) == 490, len(rows)
assert all(r["prevalence"] != "0" for r in rows if r["suppressed"] == "true")
assert all(r["prevalence"] == "" for r in rows if r["suppressed"] == "true")

counts = Counter((r["characteristic"], r["group"]) for r in rows)
assert counts[("Overall", "All adults")] == 54
assert all(count == 54 for (characteristic, _), count in counts.items() if characteristic in {"Age", "Race/Ethnicity"})
assert sum(count for (characteristic, _), count in counts.items() if characteristic == "Education") == 4

periods = defaultdict(set)
for row in rows:
    periods[row["characteristic"]].add(row["period_label"])
assert periods["Overall"] == {"BRFSS 2025"}
assert periods["Age"] == {"BRFSS 2025"}
assert periods["Education"] == {"BRFSS 2025"}
assert periods["Race/Ethnicity"] == {"BRFSS 2023–2025 pooled"}

by_key = {(r["state"], r["characteristic"], r["group"]): r for r in rows}
spot_checks = {
    ("Alabama", "Overall", "All adults"): "39.7",
    ("District of Columbia", "Overall", "All adults"): "24.2",
    ("West Virginia", "Age", "Adults aged 40–59 years"): "45.3",
    ("Arizona", "Race/Ethnicity", "Non-Hispanic American Indian or Alaska Native adults"): "50.8",
    ("Wisconsin", "Race/Ethnicity", "Non-Hispanic Black adults"): "44.1",
}
for key, expected in spot_checks.items():
    assert by_key[key]["prevalence"] == expected, (key, by_key[key]["prevalence"], expected)

for raw_path in ROOT.glob("data/raw/*.csv"):
    source = load(raw_path)
    if raw_path.name.startswith("education_"):
        continue
    assert len(source) == 54, (raw_path.name, len(source))

print("PASS: 490 tidy rows; group counts, periods, suppression handling, and 5 spot checks validated.")
