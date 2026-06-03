// netlify/functions/auth.js
//
// Shared password validation endpoint for the unified admin hub.
// Returns 200 { ok: true } on match, 401 { ok: false } on mismatch.
//
// Required Netlify env var (shared with survey.js and grants.js):
//   ADMIN_PASSWORD

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' } };
  }
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return json(400, { error: 'Bad request' }); }

  if (!process.env.ADMIN_PASSWORD || body.password !== process.env.ADMIN_PASSWORD) {
    return json(401, { ok: false, error: 'Unauthorized' });
  }

  return json(200, { ok: true });
};

function json(statusCode, payload) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(payload),
  };
}
