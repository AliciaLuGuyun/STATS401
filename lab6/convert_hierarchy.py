import argparse
import csv
import json
from pathlib import Path


def convert_rows(rows):
    """Convert flat country rows into World → continent → area → country."""
    continents = {}
    for row in rows:
        continent = continents.setdefault(row["continent"], {})
        area = continent.setdefault(row["area"], [])
        area.append({
            "name": row["country"],
            "gdp": float(row["gdp_billion_usd"]),
            "status": row["gdp_status"],
        })

    return {
        "name": "World",
        "children": [
            {
                "name": continent_name,
                "children": [
                    {"name": area_name, "children": countries}
                    for area_name, countries in areas.items()
                ],
            }
            for continent_name, areas in continents.items()
        ],
    }


def main():
    parser = argparse.ArgumentParser(description="Convert Lab 6 GDP CSV to hierarchical JSON.")
    parser.add_argument("--input", type=Path,
                        default=Path(__file__).parent.parent / "data" / "lab6_assignment_gdp.csv")
    parser.add_argument("--output", type=Path,
                        default=Path(__file__).parent.parent / "data" / "lab6_assignment_gdp.json")
    args = parser.parse_args()

    with args.input.open(encoding="utf-8-sig", newline="") as source:
        hierarchy = convert_rows(csv.DictReader(source))

    with args.output.open("w", encoding="utf-8") as destination:
        json.dump(hierarchy, destination, indent=2, ensure_ascii=False)
        destination.write("\n")


if __name__ == "__main__":
    main()
