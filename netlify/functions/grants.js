// netlify/functions/grants.js
//
// Returns all rows from your grants table as JSON.
// Same password gate and same Neon connection as the survey function —
// the connection string stays server-side only.
//
// Required Netlify environment variables:
//   DATABASE_URL    -> your Neon connection string (shared with survey.js)
//   ADMIN_PASSWORD  -> same password you use to sign in (shared with survey.js)
//   GRANTS_TABLE    -> the exact name of your grants table (REQUIRED, no default,
//                      so nothing is guessed about your schema)
//
// Optional:
//   GRANTS_SORT_COLUMN -> a column to sort by server-side (e.g. your deadline column).
//                         If set, rows come back ascending (soonest first).
//                         If unset, rows come as-is and you sort by clicking a header.

const { neon } = require('@neondatabase/serverless');

const TABLE = process.env.GRANTS_TABLE; // intentionally no default
const SORT_COL = process.env.GRANTS_SORT_COLUMN || null;

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

  if (!TABLE) {
    return json(500, { error: 'GRANTS_TABLE is not set. Add it in Netlify env vars with your grants table name.' });
  }

  if (!SAFE_IDENT.test(TABLE) || (SORT_COL && !SAFE_IDENT.test(SORT_COL))) {
    return json(500, { error: 'Invalid table/column configuration' });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);
    const order = SORT_COL ? ` ORDER BY "${SORT_COL}" ASC` : '';
    const rows = await sql(`SELECT * FROM "${TABLE}"${order}`);
    return json(200, { rows, dateColumn: SORT_COL, count: rows.length });
  } catch (err) {
    console.error('grants query error:', err);
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
