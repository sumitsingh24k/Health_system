from collections import defaultdict
from math import exp, sqrt


def _safe_mean(values: list[float]) -> float:
    if not values:
        return 0.0
    return sum(values) / len(values)


def _safe_std(values: list[float]) -> float:
    if len(values) < 2:
        return 0.0
    avg = _safe_mean(values)
    variance = sum((item - avg) ** 2 for item in values) / len(values)
    return sqrt(variance)


def _clamp(value: float, min_value: float, max_value: float) -> float:
    return max(min_value, min(max_value, value))


def _moving_average(values: list[int], window: int) -> float:
    if not values:
        return 0.0
    tail = values[-window:]
    return _safe_mean([float(item) for item in tail])


def _normalize_symptoms(raw: list[str]) -> list[str]:
    return [item.strip().lower() for item in raw if item and item.strip()]


def _symptom_disease_scores(symptoms: list[str]) -> list[dict]:
    symptom_to_diseases = {
        "fever": ["Dengue", "Malaria", "Viral Fever", "Typhoid"],
        "rash": ["Dengue", "Chikungunya", "Measles"],
        "joint pain": ["Chikungunya", "Dengue"],
        "body pain": ["Dengue", "Viral Fever"],
        "cough": ["Influenza", "COVID-like Illness", "Viral Fever"],
        "sore throat": ["Influenza", "COVID-like Illness"],
        "vomiting": ["Gastroenteritis", "Food Poisoning", "Typhoid"],
        "diarrhea": ["Gastroenteritis", "Cholera", "Food Poisoning"],
        "headache": ["Dengue", "Viral Fever", "Influenza"],
    }

    scores: dict[str, float] = defaultdict(float)
    for symptom in symptoms:
        matches = symptom_to_diseases.get(symptom, [])
        if not matches:
            continue
        for disease in matches:
            scores[disease] += 1.0 / max(len(matches), 1)

    total = sum(scores.values()) or 1.0
    ranked = sorted(scores.items(), key=lambda item: item[1], reverse=True)[:4]
    return [
        {"disease": disease, "score": round(score, 3), "probability": round(score / total, 3)}
        for disease, score in ranked
    ]


def _medicine_signal_score(medical_sales: list[dict]) -> tuple[float, list[str]]:
    disease_hints = {
        "paracetamol": "Fever syndrome signal",
        "ors": "Dehydration/diarrhea signal",
        "dolo": "Fever syndrome signal",
        "azithromycin": "Respiratory infection signal",
        "iv fluid": "Severe dehydration signal",
    }

    signal_score = 0.0
    factors: list[str] = []

    for row in medical_sales:
        medicine = str(row.get("medicine", "")).strip().lower()
        units = float(row.get("units_sold", 0) or 0)
        if units <= 0:
            continue

        for key, note in disease_hints.items():
            if key in medicine:
                boost = min(8.0, units / 30.0)
                signal_score += boost
                factors.append(f"{row.get('medicine', 'Medicine')} sales rise ({note})")
                break

    return signal_score, factors[:3]


def _build_medicine_demand(medical_sales: list[dict], probability_next_3_days: float) -> list[dict]:
    if not medical_sales:
        baseline = int(round(35 + probability_next_3_days * 45))
        return [
            {
                "medicine": "Paracetamol",
                "expected_units_next_3_days": baseline,
                "confidence": round(_clamp(0.55 + probability_next_3_days * 0.3, 0.0, 1.0), 2),
            },
            {
                "medicine": "ORS",
                "expected_units_next_3_days": int(round(baseline * 0.7)),
                "confidence": round(_clamp(0.5 + probability_next_3_days * 0.28, 0.0, 1.0), 2),
            },
        ]

    demand = []
    for sale in medical_sales[:6]:
        units = float(sale.get("units_sold", 0) or 0)
        predicted = int(round(units * (1.0 + probability_next_3_days * 0.9)))
        confidence = round(_clamp(0.55 + (units / 250.0), 0.35, 0.92), 2)
        demand.append(
            {
                "medicine": sale.get("medicine", "Unknown"),
                "expected_units_next_3_days": max(0, predicted),
                "confidence": confidence,
            }
        )
    return demand


def apply_rules(data: dict) -> dict:
    health_data = data.get("health_data", {}) or {}
    environmental_data = data.get("environmental_data", {}) or {}
    medical_data = data.get("medical_data", {}) or {}

    cases = float(health_data.get("number_of_cases", 0) or 0)
    humidity = float(environmental_data.get("humidity", 0) or 0)
    temperature = float(environmental_data.get("temperature", 0) or 0)
    rainfall = float(environmental_data.get("rainfall_mm", 0) or 0)
    population_density = float(health_data.get("population_density", 0) or 0)
    symptoms = _normalize_symptoms(health_data.get("symptoms", []) or [])
    historical_cases = [int(item) for item in (health_data.get("historical_cases", []) or []) if int(item) >= 0]
    medical_sales = medical_data.get("sales", []) or []

    contributing_factors: list[str] = []

    latest_avg = _moving_average(historical_cases, 3)
    previous_avg = _moving_average(historical_cases[:-3], 3) if len(historical_cases) > 3 else latest_avg
    growth_pct = ((latest_avg - previous_avg) / previous_avg * 100.0) if previous_avg > 0 else 0.0

    history_mean = _safe_mean([float(item) for item in historical_cases]) if historical_cases else cases
    history_std = _safe_std([float(item) for item in historical_cases]) if historical_cases else 0.0
    anomaly_flag = 1.0 if cases > (history_mean + max(6.0, 1.5 * history_std)) else 0.0

    inferred_diseases = _symptom_disease_scores(symptoms)
    medicine_signal, medicine_factors = _medicine_signal_score(medical_sales)

    if cases >= 90:
        contributing_factors.append("High case count")
    elif cases >= 45:
        contributing_factors.append("Moderate case count")

    if growth_pct >= 20:
        contributing_factors.append("Rapid growth trend detected")
    elif growth_pct >= 8:
        contributing_factors.append("Rising trend detected")

    if anomaly_flag:
        contributing_factors.append("Abnormal increase above historical baseline")

    if humidity >= 72:
        contributing_factors.append("High humidity supports vector-borne spread")

    if rainfall >= 35:
        contributing_factors.append("Rainfall conditions can increase breeding hotspots")

    if population_density >= 1200:
        contributing_factors.append("High population density may accelerate spread")

    contributing_factors.extend(medicine_factors)

    density_score = min(14.0, population_density / 140.0)
    climate_score = (max(0.0, humidity - 55.0) / 3.8) + (max(0.0, rainfall - 15.0) / 4.5)
    heat_penalty_or_boost = 5.0 if 24 <= temperature <= 35 else 2.0 if temperature > 35 else 0.5
    trend_score = max(0.0, growth_pct) * 0.45
    anomaly_score = 18.0 * anomaly_flag
    case_score = min(36.0, cases * 0.42)

    raw_risk_score = case_score + density_score + climate_score + heat_penalty_or_boost + trend_score + anomaly_score + medicine_signal
    risk_score = round(_clamp(raw_risk_score, 0.0, 100.0), 2)

    if risk_score >= 70:
        base_risk = "HIGH"
        outbreak_status = "OUTBREAK LIKELY"
    elif risk_score >= 40:
        base_risk = "MEDIUM"
        outbreak_status = "POSSIBLE OUTBREAK"
    else:
        base_risk = "LOW"
        outbreak_status = "NO OUTBREAK"

    probability_next_3_days = _clamp(
        1.0 / (1.0 + exp(-((risk_score - 45.0) / 12.0))),
        0.03,
        0.98,
    )
    predicted_growth_multiplier = 1.0 + max(0.0, growth_pct / 100.0) * 0.7 + (probability_next_3_days * 0.22)
    predicted_next_week = int(round(max(cases, 0) * predicted_growth_multiplier))
    predicted_next_3_days = int(round(max(cases, 0) * (0.32 + probability_next_3_days * 0.35)))

    medicine_demand = _build_medicine_demand(medical_sales, probability_next_3_days)

    return {
        "base_risk": base_risk,
        "risk_score": risk_score,
        "outbreak_probability_next_3_days": round(probability_next_3_days, 3),
        "outbreak_status": outbreak_status,
        "predicted_next_week": predicted_next_week,
        "predicted_next_3_days": predicted_next_3_days,
        "inferred_diseases": inferred_diseases,
        "medicine_demand_next_3_days": medicine_demand,
        "contributing_factors": list(dict.fromkeys(contributing_factors))[:8],
        "metrics": {
            "cases": cases,
            "historical_mean_cases": round(history_mean, 2),
            "historical_std_cases": round(history_std, 2),
            "growth_percent": round(growth_pct, 2),
            "anomaly_flag": bool(anomaly_flag),
            "humidity": humidity,
            "temperature": temperature,
            "rainfall_mm": rainfall,
            "population_density": population_density,
            "medical_signal_score": round(medicine_signal, 2),
        },
    }
