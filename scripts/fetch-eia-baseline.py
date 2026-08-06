from pathlib import Path
from urllib.request import urlretrieve


source_url = "https://www.eia.gov/outlooks/steo/xls/STEO_m.xlsx"
destination = Path("data/.verify/STEO_m.xlsx")

destination.parent.mkdir(parents=True, exist_ok=True)
urlretrieve(source_url, destination)
print(f"downloaded {source_url}")
