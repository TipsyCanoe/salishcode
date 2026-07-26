import { neon } from '@neondatabase/serverless';

// Public, unauthenticated write endpoint — the only one on the site. Three
// layers guard it, in this order:
//   1. per-IP rate limit  (survey_rate_limit table, fixed 1-hour window)
//   2. honeypot           (accepted with 200, silently discarded)
//   3. field length caps  (rejected with a generic 400)
//
// Required env: NETLIFY_DATABASE_URL

const WINDOW = '1 hour';
const MAX_PER_WINDOW = 5;

// Generous for a human filling this out once; hostile to a script.
const LIMITS = {
  nation: 200,
  dept: 200,
  role: 200,
  name: 200,
  member: 100,
  fisher: 100,
  vessel: 100,
  employee: 100,
  phone: 40,
  email: 254,   // RFC 5321 maximum
  calltime: 200,
  q1: 2000,
  q2: 2000,
  q3: 2000,
};

// Bots fill every field they can see. Real users never see this one.
const HONEYPOT_FIELD = 'website';

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function clientIp(req, context) {
  return (
    context?.ip ||
    req.headers.get('x-nf-client-connection-ip') ||
    (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    'unknown'
  );
}

// Fixed-window counter. The upsert is atomic, so two concurrent submissions
// from one IP can't both read a stale count and slip through.
async function overRateLimit(sql, ip) {
  const rows = await sql`
    INSERT INTO survey_rate_limit (ip, window_start, count)
    VALUES (${ip}, now(), 1)
    ON CONFLICT (ip) DO UPDATE SET
      window_start = CASE
        WHEN survey_rate_limit.window_start < now() - ${WINDOW}::interval
        THEN now() ELSE survey_rate_limit.window_start END,
      count = CASE
        WHEN survey_rate_limit.window_start < now() - ${WINDOW}::interval
        THEN 1 ELSE survey_rate_limit.count + 1 END
    RETURNING count
  `;
  return rows[0].count > MAX_PER_WINDOW;
}

export default async (req, context) => {
  if (req.method !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Invalid JSON' });
  }

  const sql = neon(process.env.NETLIFY_DATABASE_URL);

  // ── 1. Rate limit ────────────────────────────────────────────────
  // Runs before validation so malformed spam still burns quota. Fails OPEN:
  // a broken limiter must never cost us a real community response.
  const ip = clientIp(req, context);
  try {
    if (await overRateLimit(sql, ip)) {
      return json(429, {
        error: "You've submitted several responses recently. Please try again in an hour — if you need to reach us sooner, email whnlaluk@gmail.com.",
      });
    }
  } catch (err) {
    console.error('rate limit check failed, allowing through:', err.message);
  }

  // ── 2. Honeypot ──────────────────────────────────────────────────
  // Return the normal success shape so the bot has no signal to adapt to.
  if (typeof body[HONEYPOT_FIELD] === 'string' && body[HONEYPOT_FIELD].trim() !== '') {
    console.warn('honeypot triggered, discarding submission from', ip);
    return json(200, { ok: true });
  }

  // ── 3. Validation ────────────────────────────────────────────────
  for (const [field, max] of Object.entries(LIMITS)) {
    const v = body[field];
    if (typeof v === 'string' && v.length > max) {
      // Generic on purpose — don't hand a script a field-by-field map.
      return json(400, { error: 'One or more answers is too long. Please shorten your response and try again.' });
    }
  }

  if (!body.q1 && !body.q2 && !body.q3) {
    return json(400, { error: 'At least one question must be answered' });
  }

  if (body.callback && !body.phone && !body.email) {
    return json(400, { error: 'Phone or email required for callback' });
  }

  // ── Insert ───────────────────────────────────────────────────────
  try {
    await sql`
      INSERT INTO survey_responses (
        nation, department, role, respondent_name,
        wants_callback, phone, email, best_time,
        q1, q2, q3,
        member, fisher, vessel, employee
      ) VALUES (
        ${body.nation   || null},
        ${body.dept     || null},
        ${body.role     || null},
        ${body.name     || null},
        ${body.callback || false},
        ${body.phone    || null},
        ${body.email    || null},
        ${body.calltime || null},
        ${body.q1       || null},
        ${body.q2       || null},
        ${body.q3       || null},
        ${body.member   || null},
        ${body.fisher   || null},
        ${body.vessel   || null},
        ${body.employee || null}
      )
    `;

    return json(200, { ok: true });

  } catch (err) {
    console.error('DB insert error:', err);
    return json(500, { error: 'Database error' });
  }
};

export const config = { path: '/api/save-survey' };
