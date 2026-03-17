from __future__ import annotations

import json
import math
import urllib.request
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path

from generate_report import iter_detail_rows, parse_xlsx, to_num


ROOT = Path(__file__).resolve().parent
WEATHER_CACHE = ROOT / ".cache" / "open_meteo_tyumen_2025_2026.json"
WEATHER_URL = (
    "https://archive-api.open-meteo.com/v1/archive"
    "?latitude=57.1522&longitude=65.5272"
    "&start_date=2025-01-01&end_date=2026-03-17"
    "&timezone=auto"
    "&daily=weather_code,temperature_2m_max,apparent_temperature_max,"
    "precipitation_sum,precipitation_hours,wind_speed_10m_max"
)
SIGN_THRESHOLD = 0.02
RIDGE_ALPHA = 0.35

SALARY_DAYS = (5, 20)
HOLIDAYS = {
    "2025-01-01": "Новогодние каникулы",
    "2025-01-02": "Новогодние каникулы",
    "2025-01-03": "Новогодние каникулы",
    "2025-01-04": "Новогодние каникулы",
    "2025-01-05": "Новогодние каникулы",
    "2025-01-06": "Новогодние каникулы",
    "2025-01-07": "Рождество",
    "2025-01-08": "Новогодние каникулы",
    "2025-02-23": "23 февраля",
    "2025-03-08": "8 марта",
    "2025-05-01": "1 мая",
    "2025-05-02": "Перенос выходного",
    "2025-05-08": "Перенос выходного",
    "2025-05-09": "9 мая",
    "2025-06-12": "День России",
    "2025-06-13": "Перенос выходного",
    "2025-11-03": "Перенос выходного",
    "2025-11-04": "4 ноября",
    "2025-12-31": "Предновогодний выходной",
    "2026-01-01": "Новогодние каникулы",
    "2026-01-02": "Новогодние каникулы",
    "2026-01-03": "Новогодние каникулы",
    "2026-01-04": "Новогодние каникулы",
    "2026-01-05": "Новогодние каникулы",
    "2026-01-06": "Новогодние каникулы",
    "2026-01-07": "Рождество",
    "2026-01-08": "Новогодние каникулы",
    "2026-01-09": "Новогодние каникулы",
    "2026-01-10": "Новогодние каникулы",
    "2026-01-11": "Новогодние каникулы",
    "2026-02-23": "23 февраля",
    "2026-03-09": "Перенос 8 марта",
}
REGULATORY_EVENTS = {
    "2025-01-01": {"type": "excise", "reason": "новые акцизы"},
    "2026-01-01": {"type": "vat_excise", "reason": "НДС и новые акцизы"},
}


@dataclass
class WeatherDay:
    date_key: str
    temp_max: float
    temp_app: float
    precip: float
    precip_hours: float
    weather_code: int
    wind: float


@dataclass
class Sample:
    date_key: str
    residual: float
    features: dict[str, float]

    @property
    def year(self) -> int:
        return int(self.date_key[:4])


def mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def clamp(value: float, low: float, high: float) -> float:
    return min(max(value, low), high)


def corr(xs: list[float], ys: list[float]) -> float:
    x_mean = mean(xs)
    y_mean = mean(ys)
    num = sum((x - x_mean) * (y - y_mean) for x, y in zip(xs, ys))
    den_x = math.sqrt(sum((x - x_mean) ** 2 for x in xs))
    den_y = math.sqrt(sum((y - y_mean) ** 2 for y in ys))
    return num / (den_x * den_y) if den_x and den_y else 0.0


def sign_from_residual(value: float) -> int:
    if value > SIGN_THRESHOLD:
        return 1
    if value < -SIGN_THRESHOLD:
        return -1
    return 0


def shift_date_key(date_key: str, days: int) -> str:
    current = datetime.strptime(date_key, "%Y-%m-%d").date()
    return (current + timedelta(days=days)).isoformat()


def load_revenue() -> dict[str, float]:
    revenue: dict[str, float] = defaultdict(float)
    for path in sorted(ROOT.glob("Отчет *.xlsx")):
        rows = parse_xlsx(path)
        for row in iter_detail_rows(rows):
            date_key = datetime.strptime(row["F"], "%d.%m.%y %H:%M:%S").date().isoformat()
            revenue[date_key] += to_num(row.get("H"))
    return dict(sorted(revenue.items()))


def load_weather(force_refresh: bool = False) -> dict[str, WeatherDay]:
    WEATHER_CACHE.parent.mkdir(exist_ok=True)
    if force_refresh or not WEATHER_CACHE.exists():
        with urllib.request.urlopen(WEATHER_URL, timeout=30) as response:
            WEATHER_CACHE.write_bytes(response.read())

    payload = json.loads(WEATHER_CACHE.read_text())
    daily = payload["daily"]
    result: dict[str, WeatherDay] = {}
    for index, date_key in enumerate(daily["time"]):
        result[date_key] = WeatherDay(
            date_key=date_key,
            temp_max=float(daily["temperature_2m_max"][index] or 0),
            temp_app=float(daily["apparent_temperature_max"][index] or 0),
            precip=float(daily["precipitation_sum"][index] or 0),
            precip_hours=float(daily["precipitation_hours"][index] or 0),
            weather_code=int(daily["weather_code"][index] if daily["weather_code"][index] is not None else -1),
            wind=float(daily["wind_speed_10m_max"][index] or 0),
        )
    return result


def build_baselines(revenue: dict[str, float]) -> tuple[dict[str, float], dict[str, float]]:
    month_weekday_groups: dict[tuple[int, int], list[float]] = defaultdict(list)
    weekday_groups: dict[int, list[float]] = defaultdict(list)
    month_groups: dict[int, list[float]] = defaultdict(list)

    for date_key, value in revenue.items():
        current = datetime.strptime(date_key, "%Y-%m-%d").date()
        month_weekday_groups[(current.month, current.weekday())].append(value)
        weekday_groups[current.weekday()].append(value)
        month_groups[current.month].append(value)

    baselines: dict[str, float] = {}
    residuals: dict[str, float] = {}

    for date_key, value in revenue.items():
        current = datetime.strptime(date_key, "%Y-%m-%d").date()
        candidates = [
            candidate
            for candidate in month_weekday_groups[(current.month, current.weekday())]
            if candidate != value
        ]
        baseline = mean(candidates)
        if not baseline:
            baseline = mean([candidate for candidate in month_groups[current.month] if candidate != value])
        if not baseline:
            baseline = mean([candidate for candidate in weekday_groups[current.weekday()] if candidate != value])
        baselines[date_key] = baseline
        residuals[date_key] = (value - baseline) / baseline if baseline else 0.0

    return baselines, residuals


def warm_streak(weather: dict[str, WeatherDay], date_key: str, threshold: float) -> int:
    count = 0
    current = date_key
    while current in weather and weather[current].temp_app > threshold:
        count += 1
        current = shift_date_key(current, -1)
    return count


def previous_values(values_by_date: dict[str, float], date_key: str, offsets: list[int]) -> list[float]:
    return [
        values_by_date[shift_date_key(date_key, offset)]
        for offset in offsets
        if shift_date_key(date_key, offset) in values_by_date
    ]


def holiday_signal(date_key: str) -> tuple[float, str]:
    if date_key in HOLIDAYS:
        return -0.12, HOLIDAYS[date_key]

    for offset in (1, 2):
        next_key = shift_date_key(date_key, offset)
        if next_key in HOLIDAYS:
            return -0.05, f"перед {HOLIDAYS[next_key]}"

    for offset in (1, 2):
        prev_key = shift_date_key(date_key, -offset)
        if prev_key in HOLIDAYS:
            return -0.04, f"после {HOLIDAYS[prev_key]}"

    return 0.0, ""


def salary_signal(target_date: date) -> tuple[float, str]:
    best_distance = min(abs(target_date.day - day) for day in SALARY_DAYS)
    if best_distance > 2:
        return 0.0, ""
    if best_distance == 0:
        return 0.09, "зарплатный день"
    if best_distance == 1:
        return 0.06, "рядом с зарплатным днем"
    return 0.03, "окно зарплатных дней"


def weekend_signal(target_date: date, holiday_weight: float) -> tuple[float, str]:
    if holiday_weight < 0:
        return 0.0, ""
    weekday = target_date.weekday()  # Mon=0
    if weekday == 5:
        return 0.05, "субботний трафик"
    if weekday == 6:
        return -0.01, "воскресный ритм"
    if weekday == 4:
        return 0.03, "пятничный вечер"
    return 0.0, ""


def season_signal(target_date: date) -> tuple[float, str]:
    month = target_date.month
    day = target_date.day
    if month == 12 and day >= 25:
        return 0.16, "предновогодний разгон"
    if month == 1 and day <= 8:
        return -0.20, "новогодние каникулы"
    if month == 2:
        return -0.05, "февральский спокойный спрос"
    if month == 3 and day <= 15:
        return -0.03, "мартовский переходный спрос"
    if month in (6, 7, 8):
        return 0.03, "летний сезон"
    return 0.0, ""


def regulatory_signal(date_key: str) -> tuple[float, str]:
    if date_key in REGULATORY_EVENTS:
        event = REGULATORY_EVENTS[date_key]
        if event["type"] == "vat_excise":
            return -0.14, event["reason"]
        return -0.06, event["reason"]

    for offset in range(1, 22):
        previous_key = shift_date_key(date_key, -offset)
        event = REGULATORY_EVENTS.get(previous_key)
        if not event:
            continue
        if event["type"] == "vat_excise":
            if offset <= 7:
                return -0.12, "адаптация после НДС и акцизов"
            return -0.07, "адаптация после роста цен"
        if offset <= 7:
            return -0.05, "адаптация после акциза"
        return -0.02, "после роста акциза"

    return 0.0, ""


def weather_phase_features(weather: dict[str, WeatherDay], date_key: str) -> dict[str, float]:
    current = weather[date_key]
    prev_3_temps = previous_values({key: item.temp_app for key, item in weather.items()}, date_key, [-1, -2, -3])
    prev_7_temps = previous_values(
        {key: item.temp_app for key, item in weather.items()},
        date_key,
        [-1, -2, -3, -4, -5, -6, -7],
    )

    previous_day = shift_date_key(date_key, -1)
    cold_streak_before_warm = 0
    while previous_day in weather and weather[previous_day].temp_app <= -5:
        cold_streak_before_warm += 1
        previous_day = shift_date_key(previous_day, -1)

    first_warm_after_cold = (
        current.temp_app > 0
        and warm_streak(weather, date_key, 0) <= 2
        and cold_streak_before_warm >= 3
    )
    unstable_thaw = (
        current.temp_app > 0
        and warm_streak(weather, date_key, 0) <= 3
        and len(prev_7_temps) >= 4
        and mean(prev_7_temps) <= -4
    )
    settled_warm = current.temp_app >= 3 and warm_streak(weather, date_key, 0) >= 4
    return_cold = (
        current.temp_app <= -2
        and len(prev_3_temps) >= 2
        and mean(prev_3_temps) >= 1
    )
    sharp_swing = len(prev_3_temps) >= 2 and abs(current.temp_app - mean(prev_3_temps)) >= 6

    return {
        "warm_streak": float(warm_streak(weather, date_key, 0)),
        "comfortable_streak": float(warm_streak(weather, date_key, 5)),
        "first_warm_after_cold": 1.0 if first_warm_after_cold else 0.0,
        "unstable_thaw": 1.0 if unstable_thaw else 0.0,
        "settled_warm": 1.0 if settled_warm else 0.0,
        "return_cold": 1.0 if return_cold else 0.0,
        "sharp_swing": 1.0 if sharp_swing else 0.0,
        "temp_change_3": current.temp_app - mean(prev_3_temps) if prev_3_temps else 0.0,
        "temp_change_7": current.temp_app - mean(prev_7_temps) if prev_7_temps else 0.0,
    }


def weather_code_features(code: int) -> dict[str, float]:
    return {
        "clear": 1.0 if code == 0 else 0.0,
        "partly_cloudy": 1.0 if code in (1, 2, 3) else 0.0,
        "rainy": 1.0 if code in (51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82) else 0.0,
        "snowy": 1.0 if code in (71, 73, 75, 77, 85, 86) else 0.0,
        "stormy": 1.0 if code in (95, 96, 99) else 0.0,
    }


def build_samples(
    revenue: dict[str, float],
    weather: dict[str, WeatherDay],
    residuals: dict[str, float],
) -> list[Sample]:
    revenue_map = revenue
    samples: list[Sample] = []

    for date_key in sorted(revenue):
        if date_key not in weather:
            continue

        current_date = datetime.strptime(date_key, "%Y-%m-%d").date()
        weather_day = weather[date_key]
        holiday_weight, _holiday_reason = holiday_signal(date_key)
        salary_weight, _salary_reason = salary_signal(current_date)
        weekend_weight, _weekend_reason = weekend_signal(current_date, holiday_weight)
        season_weight, _season_reason = season_signal(current_date)
        regulatory_weight, _regulatory_reason = regulatory_signal(date_key)

        lag_1 = residuals.get(shift_date_key(date_key, -1), 0.0)
        lag_2 = residuals.get(shift_date_key(date_key, -2), 0.0)
        lag_7 = residuals.get(shift_date_key(date_key, -7), 0.0)
        rolling_3 = mean(previous_values(residuals, date_key, [-1, -2, -3]))
        rolling_7 = mean(previous_values(residuals, date_key, [-1, -2, -3, -4, -5, -6, -7]))
        revenue_trend = mean(previous_values(revenue_map, date_key, [-1, -2, -3])) - mean(
            previous_values(revenue_map, date_key, [-4, -5, -6, -7])
        )

        features: dict[str, float] = {
            "intercept": 1.0,
            "temp_app": weather_day.temp_app,
            "temp_max": weather_day.temp_max,
            "precip": weather_day.precip,
            "precip_hours": weather_day.precip_hours,
            "wind": weather_day.wind,
            "is_weekend": 1.0 if current_date.weekday() >= 5 else 0.0,
            "is_friday": 1.0 if current_date.weekday() == 4 else 0.0,
            "day_of_month": float(current_date.day),
            "month_end_window": 1.0 if current_date.day >= 28 else 0.0,
            "month_start_window": 1.0 if current_date.day <= 3 else 0.0,
            "salary_weight": salary_weight,
            "holiday_weight": holiday_weight,
            "weekend_weight": weekend_weight,
            "season_weight": season_weight,
            "regulatory_weight": regulatory_weight,
            "lag_1_residual": lag_1,
            "lag_2_residual": lag_2,
            "lag_7_residual": lag_7,
            "rolling_3_residual": rolling_3,
            "rolling_7_residual": rolling_7,
            "revenue_trend": revenue_trend / 100_000.0,
            "sin_doy": math.sin((current_date.timetuple().tm_yday / 366.0) * 2 * math.pi),
            "cos_doy": math.cos((current_date.timetuple().tm_yday / 366.0) * 2 * math.pi),
        }

        for month in range(1, 13):
            features[f"month_{month:02d}"] = 1.0 if current_date.month == month else 0.0
        for weekday in range(7):
            features[f"weekday_{weekday}"] = 1.0 if current_date.weekday() == weekday else 0.0

        features.update(weather_phase_features(weather, date_key))
        features.update(weather_code_features(weather_day.weather_code))

        samples.append(
            Sample(
                date_key=date_key,
                residual=residuals[date_key],
                features=features,
            )
        )

    return samples


def feature_names(samples: list[Sample]) -> list[str]:
    names: set[str] = set()
    for sample in samples:
        names.update(sample.features)
    return sorted(names)


def solve_linear_system(matrix: list[list[float]], values: list[float]) -> list[float] | None:
    size = len(matrix)
    augmented = [row[:] + [values[index]] for index, row in enumerate(matrix)]

    for column in range(size):
        pivot_row = max(range(column, size), key=lambda row: abs(augmented[row][column]))
        if abs(augmented[pivot_row][column]) < 1e-9:
            return None
        if pivot_row != column:
            augmented[column], augmented[pivot_row] = augmented[pivot_row], augmented[column]

        pivot = augmented[column][column]
        for cell in range(column, size + 1):
            augmented[column][cell] /= pivot

        for row in range(size):
            if row == column:
                continue
            factor = augmented[row][column]
            for cell in range(column, size + 1):
                augmented[row][cell] -= factor * augmented[column][cell]

    return [augmented[row][size] for row in range(size)]


def fit_ridge(train_samples: list[Sample], names: list[str]) -> tuple[list[float], dict[str, tuple[float, float]]]:
    feature_stats: dict[str, tuple[float, float]] = {}
    for name in names:
        if name == "intercept":
            feature_stats[name] = (0.0, 1.0)
            continue
        values = [sample.features.get(name, 0.0) for sample in train_samples]
        mean_value = mean(values)
        variance = mean([(value - mean_value) ** 2 for value in values])
        std_value = math.sqrt(variance) or 1.0
        feature_stats[name] = (mean_value, std_value)

    matrix: list[list[float]] = []
    targets: list[float] = []
    for sample in train_samples:
        row = []
        for name in names:
            value = sample.features.get(name, 0.0)
            mean_value, std_value = feature_stats[name]
            row.append((value - mean_value) / std_value if name != "intercept" else value)
        matrix.append(row)
        targets.append(sample.residual)

    width = len(names)
    xtx = [[0.0] * width for _ in range(width)]
    xty = [0.0] * width
    for row, target in zip(matrix, targets):
        for row_index in range(width):
            xty[row_index] += row[row_index] * target
            for col_index in range(width):
                xtx[row_index][col_index] += row[row_index] * row[col_index]

    for index in range(width):
        xtx[index][index] += 0.01 if names[index] == "intercept" else RIDGE_ALPHA

    weights = solve_linear_system(xtx, xty)
    if weights is None:
        raise RuntimeError("Не удалось решить систему для ridge-регрессии.")
    return weights, feature_stats


def predict(sample: Sample, names: list[str], weights: list[float], stats: dict[str, tuple[float, float]]) -> float:
    total = 0.0
    for weight, name in zip(weights, names):
        value = sample.features.get(name, 0.0)
        mean_value, std_value = stats[name]
        normalized = (value - mean_value) / std_value if name != "intercept" else value
        total += weight * normalized
    return total


def evaluate(samples: list[Sample], names: list[str], weights: list[float], stats: dict[str, tuple[float, float]]) -> dict[str, float | int]:
    rows = []
    for sample in samples:
        predicted_residual = predict(sample, names, weights, stats)
        predicted_sign = sign_from_residual(predicted_residual)
        actual_sign = sign_from_residual(sample.residual)
        rows.append((predicted_sign, actual_sign))

    matches = sum(1 for predicted, actual in rows if predicted == actual)
    strong_rows = [row for row in rows if row[0] != 0]
    strong_matches = sum(1 for predicted, actual in strong_rows if predicted == actual)

    return {
        "days": len(rows),
        "matches": matches,
        "match_pct": round(matches / len(rows) * 100, 1) if rows else 0.0,
        "strong_days": len(strong_rows),
        "strong_matches": strong_matches,
        "strong_match_pct": round(strong_matches / len(strong_rows) * 100, 1) if strong_rows else 0.0,
        "pred_pos": sum(1 for predicted, _ in rows if predicted == 1),
        "pred_neg": sum(1 for predicted, _ in rows if predicted == -1),
        "pred_neutral": sum(1 for predicted, _ in rows if predicted == 0),
        "actual_pos": sum(1 for _, actual in rows if actual == 1),
        "actual_neg": sum(1 for _, actual in rows if actual == -1),
        "actual_neutral": sum(1 for _, actual in rows if actual == 0),
    }


def top_weights(names: list[str], weights: list[float], limit: int = 12) -> list[tuple[str, float]]:
    pairs = [(name, weight) for name, weight in zip(names, weights) if name != "intercept"]
    pairs.sort(key=lambda item: abs(item[1]), reverse=True)
    return pairs[:limit]


def main() -> None:
    revenue = load_revenue()
    weather = load_weather()
    baselines, residuals = build_baselines(revenue)
    samples = build_samples(revenue, weather, residuals)

    train_samples = [sample for sample in samples if sample.year == 2025]
    test_samples = [sample for sample in samples if sample.year == 2026]
    names = feature_names(samples)
    weights, stats = fit_ridge(train_samples, names)

    train_metrics = evaluate(train_samples, names, weights, stats)
    test_metrics = evaluate(test_samples, names, weights, stats)
    full_metrics = evaluate(samples, names, weights, stats)

    print("TRAIN_2025", train_metrics)
    print("TEST_2026", test_metrics)
    print("ALL_2025_2026", full_metrics)
    print("TOP_WEIGHTS")
    for name, weight in top_weights(names, weights):
        print(name, round(weight, 4))

    raw_temp_corr = corr(
        [weather[sample.date_key].temp_app for sample in train_samples],
        [revenue[sample.date_key] for sample in train_samples],
    )
    residual_temp_corr = corr(
        [weather[sample.date_key].temp_app for sample in train_samples],
        [sample.residual for sample in train_samples],
    )
    print("RAW_TEMP_CORR_2025", round(raw_temp_corr, 4))
    print("RESIDUAL_TEMP_CORR_2025", round(residual_temp_corr, 4))


if __name__ == "__main__":
    main()
