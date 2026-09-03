"""Download county-level public health estimates from the CDC PLACES API."""

from pathlib import Path
import os
import time

import pandas as pd
import requests


API_URL = "https://data.cdc.gov/resource/swc5-untb.json"
TARGET_RECORDS = 1200
PAGE_SIZE = 500

OUTPUT_PATH = (
    Path(__file__).resolve().parent.parent
    / "data"
    / "lab3_health_data.csv"
)


def acquire_data():
    """Request paginated CDC data and return at least 1,000 records."""
    records = []
    offset = 0

    headers = {
        "User-Agent": "STATS401-Class-Project/1.0"
    }

    # An app token is optional for this small number of requests.
    # If CDC throttles anonymous requests, set SOCRATA_APP_TOKEN locally.
    app_token = os.getenv("SOCRATA_APP_TOKEN")
    if app_token:
        headers["X-App-Token"] = app_token

    with requests.Session() as session:
        while len(records) < TARGET_RECORDS:
            params = {
                "$select": (
                    "year,stateabbr,locationname,category,"
                    "measure,data_value,data_value_unit"
                ),
                "$where": "data_value is not null",
                "$limit": PAGE_SIZE,
                "$offset": offset,
            }

            page_data = None

            # Retry temporary timeouts up to three times.
            for attempt in range(1, 4):
                try:
                    response = session.get(
                        API_URL,
                        params=params,
                        headers=headers,
                        timeout=60,
                    )
                    response.raise_for_status()
                    page_data = response.json()
                    break

                except requests.RequestException as error:
                    print(
                        f"Attempt {attempt} failed at offset "
                        f"{offset}: {error}"
                    )

                    if attempt < 3:
                        time.sleep(5 * attempt)

            if page_data is None:
                break

            if not page_data:
                break

            records.extend(page_data)
            print(
                f"Downloaded {len(page_data)} records; "
                f"total collected: {len(records)}"
            )

            offset += PAGE_SIZE

            # The assignment asks for reasonable rate limiting.
            if len(records) < TARGET_RECORDS:
                time.sleep(1)

    records = records[:TARGET_RECORDS]

    if len(records) < 1000:
        raise RuntimeError(
            f"Only {len(records)} records were collected. "
            "Run the script again before submitting."
        )

    return records


def save_data(records):
    """Clean numeric values and save the records as CSV."""
    data = pd.DataFrame(records)
    data["data_value"] = pd.to_numeric(
        data["data_value"],
        errors="coerce",
    )

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    data.to_csv(OUTPUT_PATH, index=False)

    print(f"Saved {len(data)} records to {OUTPUT_PATH}")


if __name__ == "__main__":
    save_data(acquire_data())
