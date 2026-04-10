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
    parsed_output["rule_engine_assessment"] = rule_output
    return PredictionResult.model_validate(parsed_output)
