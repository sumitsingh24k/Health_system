def apply_rules(data: dict) -> dict:
    health_data = data.get("health_data", {})
    environmental_data = data.get("environmental_data", {})

    cases = health_data.get("number_of_cases", 0)
    humidity = environmental_data.get("humidity", 0)
    temperature = environmental_data.get("temperature", 0)
    population_density = health_data.get("population_density", 0)

    risk = "LOW"
    factors = []

    if cases > 100 and humidity > 70:
        risk = "HIGH"
        factors.append("High case count with high humidity")
    elif cases > 100:
        risk = "HIGH"
        factors.append("High case count")
    elif cases > 50:
        risk = "MEDIUM"
        factors.append("Moderate case count")

    if temperature > 35:
        if risk != "HIGH":
            risk = "MEDIUM"
        factors.append("Extreme temperature")

    if humidity > 80:
        if risk == "LOW":
            risk = "MEDIUM"
        factors.append("Very high humidity")

    if population_density > 1000:
        if risk == "LOW":
            risk = "MEDIUM"
        factors.append("High population density")

    return {
        "base_risk": risk,
        "contributing_factors": factors,
        "metrics": {
            "cases": cases,
            "humidity": humidity,
            "temperature": temperature,
            "population_density": population_density,
        },
    }
