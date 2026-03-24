import { neon } from '@netlify/neon';

export default async (req) => {
  // Simple password check via header
  const auth = req.headers.get('x-admin-key');
  if (auth !== process.env.ADMIN_KEY) {
    return new Response('Unauthorized', { status: 401 });
  }

  const sql = neon();

  try {
    // Summary stats
    const [stats] = await sql`
      SELECT
        COUNT(*)                                          AS total,
        COUNT(*) FILTER (WHERE wants_callback = true)    AS callbacks,
        COUNT(*) FILTER (WHERE followed_up = true)       AS followed_up,
        COUNT(DISTINCT nation)
          FILTER (WHERE nation IS NOT NULL)              AS nations,
        COUNT(DISTINCT department)
          FILTER (WHERE department IS NOT NULL)          AS departments
      FROM survey_responses
    `;

    // Responses by department
    const byDept = await sql`
      SELECT department AS label, COUNT(*) AS count
      FROM survey_responses
      WHERE department IS NOT NULL
      GROUP BY department
      ORDER BY count DESC
      LIMIT 12
    `;

    // Responses by nation
    const byNation = await sql`
      SELECT nation AS label, COUNT(*) AS count
      FROM survey_responses
      WHERE nation IS NOT NULL
      GROUP BY nation
      ORDER BY count DESC
      LIMIT 12
    `;

    // Callback requests - unresolved first
    const callbacks = await sql`
      SELECT id, submitted_at, respondent_name, nation, department,
             role, phone, email, best_time, q1, q2, q3, followed_up
      FROM survey_responses
      WHERE wants_callback = true
      ORDER BY followed_up ASC, submitted_at DESC
      LIMIT 50
    `;

    // Recent responses
    const recent = await sql`
      SELECT id, submitted_at, respondent_name, nation, department,
             role, wants_callback, q1, q2, q3, followed_up
      FROM survey_responses
      ORDER BY submitted_at DESC
      LIMIT 25
    `;

    return new Response(JSON.stringify({ stats, byDept, byNation, callbacks, recent }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('Query error:', err);
    return new Response('Database error', { status: 500 });
  }
};

export const config = { path: '/api/get-responses' };
