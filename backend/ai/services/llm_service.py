import logging
import os
import requests
from requests.exceptions import ConnectionError, Timeout, RequestException

logger = logging.getLogger(__name__)

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434/api/generate")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.1:8b")
REQUEST_TIMEOUT = int(os.getenv("OLLAMA_TIMEOUT_SECONDS", "120"))
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "ollama").strip().lower()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip()
GEMINI_API_BASE = os.getenv(
    "GEMINI_API_BASE",
    "https://generativelanguage.googleapis.com/v1beta/models",
).rstrip("/")


def _call_ollama(prompt: str) -> str:
    try:
        response = requests.post(
            OLLAMA_URL,
            json={
                "model": OLLAMA_MODEL,
                "prompt": prompt,
                "stream": False,
            },
            timeout=REQUEST_TIMEOUT,
        )
        response.raise_for_status()
        result = response.json()
        return result.get("response", "")

    except ConnectionError:
        logger.error("Cannot connect to Ollama at %s. Is Ollama running?", OLLAMA_URL)
        raise RuntimeError(
            f"Cannot connect to Ollama at {OLLAMA_URL}. "
            "Please ensure Ollama is installed and running: `ollama serve`"
        )
    except Timeout:
        logger.error("Ollama request timed out after %ds", REQUEST_TIMEOUT)
        raise RuntimeError(
            f"Ollama request timed out after {REQUEST_TIMEOUT}s. "
            "The model may be loading or the prompt is too large."
        )
    except RequestException as e:
        logger.error("Ollama request failed: %s", e)
        raise RuntimeError(f"Ollama request failed: {e}")


def _call_gemini(prompt: str) -> str:
    if not GEMINI_API_KEY:
        raise RuntimeError(
            "GEMINI_API_KEY is missing. Set GEMINI_API_KEY in environment variables."
        )

    endpoint = f"{GEMINI_API_BASE}/{GEMINI_MODEL}:generateContent"
    try:
        response = requests.post(
            endpoint,
            params={"key": GEMINI_API_KEY},
            json={
                "contents": [
                    {
                        "parts": [{"text": prompt}],
                    }
                ],
                "generationConfig": {
                    "temperature": 0.2,
                    "topP": 0.9,
                },
            },
            timeout=REQUEST_TIMEOUT,
        )
        response.raise_for_status()
        result = response.json()

        candidates = result.get("candidates") or []
        if not candidates:
            raise RuntimeError("Gemini returned no candidates")

        parts = candidates[0].get("content", {}).get("parts", [])
        text = "".join(part.get("text", "") for part in parts if isinstance(part, dict)).strip()
        if not text:
            raise RuntimeError("Gemini returned empty text output")
        return text

    except Timeout:
        logger.error("Gemini request timed out after %ds", REQUEST_TIMEOUT)
        raise RuntimeError(f"Gemini request timed out after {REQUEST_TIMEOUT}s.")
    except RequestException as e:
        logger.error("Gemini request failed: %s", e)
        raise RuntimeError(f"Gemini request failed: {e}")


def call_llm(prompt: str) -> str:
    provider = LLM_PROVIDER
    if provider == "gemini":
        return _call_gemini(prompt)
    return _call_ollama(prompt)
