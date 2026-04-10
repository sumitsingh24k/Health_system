export async function readApiPayload(response) {
  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.toLowerCase().includes("application/json");

  if (isJson) {
    try {
      return await response.json();
    } catch (_error) {
      return null;
    }
  }

  try {
    const text = await response.text();
    return text ? { message: text } : null;
  } catch (_error) {
    return null;
  }
}

export function resolveApiError(payload, fallbackMessage) {
  if (!payload) return fallbackMessage;
  if (payload?.error) return `${payload.message || "Request failed"}: ${payload.error}`;
  if (payload?.message) return payload.message;
  return fallbackMessage;
}
