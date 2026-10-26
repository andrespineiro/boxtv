// ---------------------------------------------------------------------------
// Small HTTP helpers shared by the Worker routes.
// ---------------------------------------------------------------------------

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,X-Admin-Key',
};

/** JSON response with the API CORS headers. */
export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

/** Standard `{ error }` response used by every API failure path. */
export function errorJson(message: string, status: number): Response {
  return json({ error: message }, status);
}
