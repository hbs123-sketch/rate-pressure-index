# Rate Pressure Index

Rate Pressure Index is a public-data indicator for exploring whether data-center-related grid buildout may be adding pressure to electricity rates in a utility territory. It is a small, static pilot covering Dominion Energy Virginia, AEP Ohio, and Georgia Power through a conservative ZIP lookup.

It is not a determination that any individual customer's bill changed because of a data center. The index is designed to make its inputs, source links, limitations, and estimates easy to inspect.

## How It Works

Each pilot utility receives a 0-100 composite score from five sourced factors in `data/utilities.json`:

| Factor | Weight | What it captures |
| --- | ---: | --- |
| Grid constraint | 25% | Public signals of regional generation or transmission pressure. |
| Tariff protection | 25% | Whether large-load customers have a distinct tariff or cost-protection mechanism. |
| Buildout scale | 20% | Publicly reported scale of data-center or other large-load growth. |
| Rate case | 20% | Current, approved, or proposed retail-rate changes. |
| Rate trend | 10% | Recent residential-rate movement compared with a national EIA baseline. |

Scores are rounded to the nearest whole number and grouped as Low (0-30), Moderate (31-55), Elevated (56-75), or High (76-100). The full explanation, source links, and limitations are available on the site's methodology page and in each utility record.

The ZIP lookup is deliberately narrow. ZIP codes do not reliably match electric service territories, so an uncovered or ambiguous ZIP never receives a default score.

## Data And Attribution

`data/utilities.json` contains the curated pilot dataset: factor scores, notes, links to primary sources, dates, public figures, and supporting display text. `data/zip-to-utility.json` contains the conservative pilot ZIP mapping. The project also includes EIA-derived pilot summaries used to support the historical-rate display.

The **MIT license applies only to the original software code and documentation in this repository**. It does not grant rights to redistribute the curated `utilities.json` dataset, the sourced content summaries, or any third-party source material as-is.

Please do not redistribute that dataset or sourced content without clear attribution to **Rate Pressure Index** and preservation of the relevant source URLs. Third-party sources remain subject to their own terms and licenses. For analysis or reuse, link back to this project and cite the original regulator, utility, or EIA source for the underlying fact.

## Run Locally

Prerequisites:

- Node.js 20 or later
- Python 3 for the simple local static server

Install the JavaScript dependencies:

```bash
npm ci
```

Start the site from the project root:

```bash
python -m http.server 4173
```

Open [http://127.0.0.1:4173/index.html](http://127.0.0.1:4173/index.html). Test the three pilot ZIPs: `20147`, `43215`, and `30303`. `90210` is intentionally outside the pilot coverage.

For browser audits, install Chromium once:

```bash
npx playwright install chromium
```

## Checks

```bash
npm test
npm run test:browser
npm run test:edge
npm run test:a11y
npm run test:seo
npm run test:security
npm run test:source
npm audit
```

The browser audit expects the local server above to be running. The source check uses the included Python tooling; install its development requirements when running source verification:

```bash
python -m pip install -r requirements-dev.txt
```

## Project Layout

- `data/utilities.json`: scored utility records, source-linked claims, and display figures.
- `data/zip-to-utility.json`: intentionally limited pilot ZIP coverage.
- `src/`: browser-side lookup, scoring, reporting, and display modules.
- `api/recommendation-click.js`: privacy-minimal recommendation-click event endpoint.
- `tests/`: scoring, browser, accessibility, SEO, source, edge-case, and security audits.
- `scripts/`: reproducible EIA data preparation and verification helpers.

## License

Original project code is released under the [MIT License](LICENSE). The dataset and sourced content have the separate attribution terms described above.
