import json

_RESPONSE_SCHEMA = json.dumps(
    {
        "location": {"city": "Unknown", "region": "Unknown", "country": "Unknown"},
        "risk_level": "LOW|MEDIUM|HIGH",
        "risk_score": 0,
        "outbreak_probability_next_3_days": 0.0,
        "outbreak_status": "NO OUTBREAK|POSSIBLE OUTBREAK|OUTBREAK LIKELY",
        "cases": {"current": 0, "predicted_next_week": 0, "predicted_next_3_days": 0},
        "disease_predictions": [
            {"disease": "", "probability": 0.0, "reason": ""}
        ],
        "medicine_demand_next_3_days": [
            {"medicine": "", "expected_units_next_3_days": 0, "confidence": 0.0}
        ],
        "smart_alerts": [],
        "recommended_action": [],
        "confidence_score": 0.0,
    },
    indent=2,
)


def _format_input_data(data: dict, rules: dict) -> str:
    location = data.get("location", {}) or {}
    health = data.get("health_data", {}) or {}
    env = data.get("environmental_data", {}) or {}
    medical = data.get("medical_data", {}) or {}
    time_period = data.get("time_period", {}) or {}

    sales = medical.get("sales", []) or []
    sales_summary = (
        ", ".join(
            f"{item.get('medicine', 'Unknown')} (units={item.get('units_sold', 0)}, price={item.get('unit_price', 0)})"
            for item in sales[:8]
        )
        if sales
        else "None"
    )

    return (
        f"Location: {location.get('city', 'Unknown')}, "
        f"{location.get('region', 'Unknown')}, "
        f"{location.get('country', 'Unknown')}\n"
        f"Time Period: {time_period.get('start', 'Unknown')} to {time_period.get('end', 'Unknown')}\n"
        f"Reported Disease Tag: {health.get('disease_type', 'Unknown')}\n"
        f"Symptoms: {', '.join(health.get('symptoms', []) or []) or 'None'}\n"
        f"Number of Cases: {health.get('number_of_cases', 0)}\n"
        f"Historical Cases: {health.get('historical_cases', []) or []}\n"
        f"Population Density: {health.get('population_density', 0)}\n"
        f"Temperature: {env.get('temperature', 0)} C\n"
        f"Humidity: {env.get('humidity', 0)}%\n"
        f"Rainfall: {env.get('rainfall_mm', 0)} mm\n"
        f"Medical Sales Signals: {sales_summary}\n"
        f"Rule Engine Base Risk: {rules.get('base_risk', 'UNKNOWN')}\n"
        f"Rule Engine Risk Score: {rules.get('risk_score', 0)}\n"
        f"Rule Engine Probability (next 3 days): {rules.get('outbreak_probability_next_3_days', 0)}\n"
        f"Rule Engine Contributing Factors: {', '.join(rules.get('contributing_factors', [])) or 'None identified'}\n"
        f"Rule Engine Disease Hints: {rules.get('inferred_diseases', [])}\n"
        f"Rule Engine Medicine Demand Hint: {rules.get('medicine_demand_next_3_days', [])}"
    )


def build_prompt(data: dict, rules: dict) -> str:
    input_data = _format_input_data(data, rules)

    return f"""You are an advanced public health AI system for district-level outbreak intelligence.

You must analyze ASHA case data + medical sales data + environment and return STRICT JSON only.

------------------------
INPUT DATA:
{input_data}
------------------------

INSTRUCTIONS:
1. Analyze symptoms carefully and identify possible diseases.
2. Use environmental conditions (temperature, humidity, rainfall) to refine disease prediction.
3. Consider number_of_cases and population_density to estimate spread risk.
4. Predict the number of cases for the next week based on current trend.
5. Assign a risk level:
   - LOW (few cases, weak symptoms, low spread chance)
   - MEDIUM (moderate cases or moderate spread conditions)
   - HIGH (rapid spread, strong symptoms, favorable environment)
6. Determine outbreak status:
   - NO OUTBREAK
   - POSSIBLE OUTBREAK
   - OUTBREAK LIKELY
7. Provide at least 2-3 disease predictions with probability (0 to 1).
8. Give short reasoning for each disease.
9. Provide 3-5 actionable recommendations.
10. Include medicine demand prediction for next 3 days based on risk and sales signal.
11. Include 2-3 short smart alerts in simple language for local responders.

IMPORTANT RULES:
- DO NOT assume disease is given.
- Use symptoms + environment + medical sales trends to infer diseases.
- Be logical and realistic.
- Always include location in output.
- Probabilities must be decimals (e.g., 0.75).
- predicted_next_week cases must be higher if growth conditions are strong.
- confidence_score must be between 0 and 1.
- risk_score must be between 0 and 100.
- outbreak_probability_next_3_days must be between 0 and 1.
- Keep output concise and actionable.

------------------------
RETURN STRICT JSON ONLY (NO TEXT OUTSIDE JSON):

{_RESPONSE_SCHEMA}

------------------------

EXAMPLE BEHAVIOR:
Symptoms: fever + rash + joint pain
Environment: high humidity + rainfall
-> Likely diseases: Dengue, Chikungunya
-> Risk: HIGH
-> Cases should increase

Now analyze the input and return JSON."""
