from pathlib import Path

import openpyxl


def avg(values):
    return sum(values) / len(values)


def round1(value):
    return round(value + 1e-9, 1)


workbook_path = Path("data/.verify/STEO_m.xlsx")
workbook = openpyxl.load_workbook(workbook_path, read_only=True, data_only=True)
sheet = workbook["7atab"]
prices = [cell.value for cell in sheet[43]]

price_2025 = avg([float(prices[index - 1]) for index in range(39, 51)])
price_2026 = avg([float(prices[index - 1]) for index in range(51, 63)])
price_2027 = avg([float(prices[index - 1]) for index in range(63, 75)])

assert abs(price_2025 - 17.3325) < 0.01, price_2025
assert abs(price_2026 - 18.314) < 0.01, price_2026
assert abs(price_2027 - 18.715) < 0.01, price_2027
assert round1((price_2026 / price_2025 - 1) * 100) == 5.7
assert round1((price_2027 / price_2025 - 1) * 100) == 8.0

print("verified EIA STEO baseline")
