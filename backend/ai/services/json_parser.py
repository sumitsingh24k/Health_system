import json
import logging
import re

logger = logging.getLogger(__name__)


def _extract_json_string(raw: str) -> str:
    """Extract JSON from LLM output that may be wrapped in markdown code blocks."""
    code_block = re.search(r"```(?:json)?\s*\n?(.*?)\n?\s*```", raw, re.DOTALL)
    if code_block:
        return code_block.group(1).strip()

    brace_match = re.search(r"\{.*\}", raw, re.DOTALL)
    if brace_match:
        return brace_match.group(0)

    return raw.strip()


def _build_fallback(raw_output: str, input_data: dict) -> dict:
    location = input_data.get("location", {})
    health_data = input_data.get("health_data", {})

    return {
        "location": location,
        "risk_level": "UNKNOWN",
        "outbreak_status": "NO OUTBREAK",
        "cases": {
            "current": health_data.get("number_of_cases", 0),
            "predicted_next_week": "N/A",
        },
        "disease_predictions": [],
        "recommended_action": [
            "Manual review recommended - LLM output could not be parsed"
        ],
        "confidence_score": 0.0,
        "raw_llm_output": raw_output,
    }


def parse_llm_json(raw_output: str, input_data: dict) -> dict:
    json_str = _extract_json_string(raw_output)

    try:
        parsed = json.loads(json_str)
    except (json.JSONDecodeError, TypeError) as e:
        logger.warning("Failed to parse LLM JSON: %s", e)
        return _build_fallback(raw_output, input_data)

    if not isinstance(parsed, dict):
        logger.warning("LLM returned non-dict JSON: %s", type(parsed))
        return _build_fallback(raw_output, input_data)

    parsed.setdefault("location", input_data.get("location", {}))
    parsed.setdefault("risk_level", "UNKNOWN")
    parsed.setdefault("outbreak_status", "UNKNOWN")
    parsed.setdefault("cases", {})
    parsed.setdefault("disease_predictions", [])
    parsed.setdefault("recommended_action", [])
    parsed.setdefault("confidence_score", 0.0)

    return parsed
