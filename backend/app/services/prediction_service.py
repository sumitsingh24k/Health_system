from app.models.prediction import PredictionRequest, PredictionResult
from ai.services.json_parser import parse_llm_json
from ai.services.llm_service import call_llm
from ai.services.rules_engine import apply_rules
from ai.utils.prompt_builder import build_prompt


class PredictionServiceError(Exception):
    pass


class LLMUnavailableError(PredictionServiceError):
    pass


def predict_outbreak(data: PredictionRequest) -> PredictionResult:
    input_data = data.model_dump()
    rule_output = apply_rules(input_data)
    prompt = build_prompt(input_data, rule_output)

    try:
        raw_llm_output = call_llm(prompt)
    except RuntimeError as exc:
        raise LLMUnavailableError(str(exc)) from exc

    parsed_output = parse_llm_json(raw_llm_output, input_data)
    parsed_output.setdefault("risk_level", rule_output.get("base_risk", "UNKNOWN"))
    parsed_output.setdefault("risk_score", rule_output.get("risk_score", 0.0))
    parsed_output.setdefault(
        "outbreak_probability_next_3_days",
        rule_output.get("outbreak_probability_next_3_days", 0.0),
    )
    parsed_output.setdefault("outbreak_status", rule_output.get("outbreak_status", "UNKNOWN"))
    parsed_output.setdefault(
        "medicine_demand_next_3_days",
        rule_output.get("medicine_demand_next_3_days", []),
    )

    cases_block = parsed_output.get("cases", {})
    if not isinstance(cases_block, dict):
        cases_block = {}
    cases_block.setdefault("current", input_data.get("health_data", {}).get("number_of_cases", 0))
    cases_block.setdefault("predicted_next_week", rule_output.get("predicted_next_week", 0))
    cases_block.setdefault("predicted_next_3_days", rule_output.get("predicted_next_3_days", 0))
    parsed_output["cases"] = cases_block

    if not parsed_output.get("disease_predictions"):
        parsed_output["disease_predictions"] = [
            {
                "disease": item.get("disease", "Unknown"),
                "probability": item.get("probability", 0.0),
                "reason": "Rule-engine symptom inference",
            }
            for item in rule_output.get("inferred_diseases", [])
        ]

    parsed_output.setdefault("smart_alerts", [])
    parsed_output.setdefault("recommended_action", [])

    parsed_output["rule_engine_assessment"] = rule_output
    return PredictionResult.model_validate(parsed_output)
