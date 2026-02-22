export function apiError(
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): Response {
  return Response.json({ error: code, message, details }, { status });
}
