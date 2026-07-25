// netlify/functions/survey.js
//
// Returns all survey rows as JSON, newest first.
// The Neon connection string lives ONLY here (server-side) via env var,
// so it is never exposed to the browser.
//
// Required Netlify environment variables (Site settings > Environment variables):
//   DATABASE_URL    -> your Neon connection string (the pooled one is fine)
//   ADMIN_PASSWORD  -> the password you'll type on the admin page
//
// Optional (override the defaults below if your schema differs):
//   SURVEY_TABLE        -> defaults to "survey_responses"
//   SURVEY_DATE_COLUMN  -> defaults to "created_at"

const { neon } = require('@neondatabase/serverless');

const TABLE = process.env.SURVEY_TABLE || 'survey_responses';
const DATE_COL = process.env.SURVEY_DATE_COLUMN || 'created_at';

// Only allow plain identifiers through, so the env-configured names
// can't be abused for injection.
const SAFE_IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Bad request' });
  }

  if (!process.env.ADMIN_PASSWORD || body.password !== process.env.ADMIN_PASSWORD) {
    return json(401, { error: 'Unauthorized' });
  }

  if (!process.env.DATABASE_URL) {
    return json(500, { error: 'DATABASE_URL is not set on the server' });
  }

  if (!SAFE_IDENT.test(TABLE) || !SAFE_IDENT.test(DATE_COL)) {
    return json(500, { error: 'Invalid table/column configuration' });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);
    // Identifiers can't be parameterized, but they're validated above.
    const rows = await sql(
      `SELECT * FROM "${TABLE}" ORDER BY "${DATE_COL}" DESC`
    );
    return json(200, { rows, dateColumn: DATE_COL, count: rows.length });
  } catch (err) {
    console.error('survey query error:', err);
    return json(500, { error: 'Query failed' });
  }
};

function json(statusCode, payload) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  };
}
