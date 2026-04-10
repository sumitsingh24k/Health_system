import json

_RESPONSE_SCHEMA = json.dumps({
    "location": {},
    "risk_level": "",
    "outbreak_status": "",
    "cases": {"current": 0, "predicted_next_week": 0},
    "disease_predictions": [
        {"disease": "", "probability": 0, "reason": ""}
    ],
    "recommended_action": [],
    "confidence_score": 0,
}, indent=2)


def _format_input_data(data: dict, rules: dict) -> str:
    location = data.get("location", {})
    health = data.get("health_data", {})
    env = data.get("environmental_data", {})
    time_period = data.get("time_period", {})

    return (
        f"Location: {location.get('city', 'Unknown')}, "
        f"{location.get('region', 'Unknown')}, "
        f"{location.get('country', 'Unknown')}\n"
        f"Time Period: {time_period.get('start', 'Unknown')} to {time_period.get('end', 'Unknown')}\n"
        f"Disease Type: {health.get('disease_type', 'Unknown')}\n"
        f"Number of Cases: {health.get('number_of_cases', 0)}\n"
        f"Population Density: {health.get('population_density', 0)}\n"
        f"Temperature: {env.get('temperature', 0)}°C\n"
        f"Humidity: {env.get('humidity', 0)}%\n"
        f"Rainfall: {env.get('rainfall_mm', 0)} mm\n"
        f"Rule Engine Base Risk: {rules.get('base_risk', 'UNKNOWN')}\n"
        f"Contributing Factors: {', '.join(rules.get('contributing_factors', [])) or 'None identified'}"
    )


def build_prompt(data: dict, rules: dict) -> str:
    input_data = _format_input_data(data, rules)

    return f"""You are an advanced public health AI system designed to detect disease outbreaks.

You will analyze structured health data and MUST return a valid JSON response.

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

IMPORTANT RULES:
- DO NOT assume disease is given.
- Use symptoms + environment to infer diseases.
- Be logical and realistic (not random).
- Always include location in output.
- Probabilities must be decimals (e.g., 0.75).
- predicted_next_week cases must be higher if growth conditions are strong.
- confidence_score must be between 0 and 1.

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

------------------------

Now analyze the input and return JSON."""
