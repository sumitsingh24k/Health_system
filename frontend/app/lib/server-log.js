export function logServerError(scope, error) {
  const label = typeof scope === "string" && scope.trim() ? scope.trim() : "server";
  const reason = error instanceof Error ? error.message : String(error || "Unknown error");

  console.error(`[${label}] ${reason}`);

  if (process.env.NODE_ENV !== "production" && error instanceof Error && error.stack) {
    console.error(error.stack);
  }
}
