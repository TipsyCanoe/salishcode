import { neon } from '@netlify/neon';

export default async (req) => {
  const auth = req.headers.get('x-admin-key');
  if (auth !== process.env.ADMIN_KEY) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let body;
  try { body = await req.json(); } catch { return new Response('Invalid JSON', { status: 400 }); }

  const sql = neon();

  await sql`
    UPDATE survey_responses
    SET followed_up = ${body.followed_up ?? true}
    WHERE id = ${body.id}
  `;

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};

export const config = { path: '/api/mark-followup' };
