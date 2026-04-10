import { readApiPayload, resolveApiError } from "@/app/lib/fetch-utils";

const DEFAULT_BACKEND_URL = "http://localhost:8000";

function trimTrailingSlash(value) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function getBackendBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_BACKEND_URL || DEFAULT_BACKEND_URL;
  return trimTrailingSlash(configured);
}

function normalizeErrorMessage(payload, fallbackMessage) {
  if (payload?.detail) {
    if (Array.isArray(payload.detail)) {
      return payload.detail
        .map((entry) => entry?.msg || entry?.message || "Validation error")
        .join(", ");
    }
    return payload.detail;
  }
  return resolveApiError(payload, fallbackMessage);
}

async function request(path, options = {}, fallbackError = "Request failed") {
  const url = `${getBackendBaseUrl()}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
    },
    cache: options.cache || "no-store",
  });

  const payload = await readApiPayload(response);
  if (!response.ok) {
    throw new Error(normalizeErrorMessage(payload, fallbackError));
  }

  if (payload && typeof payload === "object" && "data" in payload) {
    return payload.data;
  }

  return payload;
}

export async function backendGet(path, options = {}, fallbackError = "Request failed") {
  return request(
    path,
    {
      ...options,
      method: "GET",
    },
    fallbackError
  );
}

export async function backendPost(path, body, options = {}, fallbackError = "Request failed") {
  return request(
    path,
    {
      ...options,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    fallbackError
  );
}
