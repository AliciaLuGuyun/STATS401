# Lab 3: Local Setup

Run these commands from the project root.

## 1. Create and activate a virtual environment

```sh
python3 -m venv .venv
source .venv/bin/activate
```

## 2. Install the Python packages

```sh
python3 -m pip install requests pandas "urllib3<2"
```

## 3. Acquire the CDC data

```sh
python3 lab3/acquire_health_data.py
```

The script should create `data/lab3_health_data.csv` with 1,200 records.
The request may take a few seconds. If the CDC server temporarily times out,
the script retries automatically up to three times.

## 4. Run the website locally

```sh
python3 -m http.server 8000
```

Open <http://localhost:8000/lab3/>. Stop the server with `Control+C`.

Before publishing, commit the Python script, the generated CSV, the Lab 3 HTML and JavaScript files, and the shared stylesheet. Do not commit `.venv/`.
