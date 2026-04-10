import logging
import requests
from requests.exceptions import ConnectionError, Timeout, RequestException

logger = logging.getLogger(__name__)

OLLAMA_URL = "http://localhost:11434/api/generate"
OLLAMA_MODEL = "llama3:8b"
REQUEST_TIMEOUT = 120


def call_llm(prompt: str) -> str:
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
