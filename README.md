# Rate Pressure Index

A static v1 ZIP lookup for three pilot electric utilities: Dominion Energy Virginia, AEP Ohio, and Georgia Power.

## Run locally

```bash
python -m http.server 4173
```

Open `http://127.0.0.1:4173/index.html`.

## Test

```bash
npm test
```

## Data notes

- `data/utilities.json` contains the scored pilot utility rows and source URLs.
- `data/zip-to-utility.json` is a conservative pilot ZIP lookup. EIA Form 861 service territory data is county/state based, not ZIP based, so full ZIP-level national coverage is a v2 pipeline.
- `scripts/build-eia-pilot-data.py` extracts pilot utility metadata, service counties, and bundled sales rows from the official EIA Form 861 2024 final archive.
- `data/eia-pilot-summary.json` is generated from the EIA workbook and checked in for review.

## Verified pilot ZIPs

- `20147` -> Dominion Energy Virginia
- `43215` -> AEP Ohio
- `30303` -> Georgia Power
- `90210` -> not covered
