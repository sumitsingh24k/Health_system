export async function parseJsonBody(request) {
  try {
    const body = await request.json();
    return { body, error: null };
  } catch (_error) {
    return {
      body: null,
      error: Response.json({ message: "Invalid JSON body" }, { status: 400 }),
    };
  }
}

export function normalizeRequiredString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeEmail(value) {
  const email = normalizeRequiredString(value);
  return email ? email.toLowerCase() : "";
}
