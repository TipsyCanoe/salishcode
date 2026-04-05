import { neon } from '@netlify/neon';

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  // Require at least one real answer
  if (!body.q1 && !body.q2 && !body.q3) {
    return new Response('At least one question must be answered', { status: 400 });
  }

  // Callback validation
  if (body.callback && !body.phone && !body.email) {
    return new Response('Phone or email required for callback', { status: 400 });
  }

  try {
    const sql = neon(process.env.NETLIFY_DATABASE_URL);  // automatically uses NETLIFY_DATABASE_URL

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

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('DB insert error:', err);
    return new Response('Database error', { status: 500 });
  }
};

export const config = { path: '/api/save-survey' };
