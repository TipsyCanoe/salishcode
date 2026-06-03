// netlify/functions/workstation.js
//
// Full CRUD for the Salish Code AI Workstation schema.
// Connection string and password live server-side only.
//
// Required Netlify env vars:
//   WORKSTATION_DB_URL  -> Neon connection string (full-access role, NOT reminder_agent)
//   ADMIN_PASSWORD      -> shared admin password used across admin tools

const { neon } = require('@neondatabase/serverless');

function json(status, body) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' } };
  }

  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return json(400, { error: 'Bad JSON' }); }

  const providedPassword = body.password || body.key || '';
  if (!process.env.ADMIN_PASSWORD || providedPassword !== process.env.ADMIN_PASSWORD) {
    return json(401, { error: 'Unauthorized' });
  }

  if (!process.env.WORKSTATION_DB_URL) return json(500, { error: 'WORKSTATION_DB_URL not set' });

  const sql = neon(process.env.WORKSTATION_DB_URL);
  const { action } = body;

  try {
    // ── PROJECTS ──────────────────────────────────────────────

    if (action === 'list_projects') {
      const rows = await sql`
        SELECT p.*,
          COUNT(t.id) FILTER (WHERE t.status != 'done') AS open_tasks,
          COUNT(t.id) AS total_tasks
        FROM projects p
        LEFT JOIN tasks t ON t.project_id = p.id
        GROUP BY p.id
        ORDER BY p.priority, p.updated_at DESC
      `;
      return json(200, { projects: rows });
    }

    if (action === 'create_project') {
      const { name, category, priority, description, status } = body;
      if (!name) return json(400, { error: 'name required' });
      const rows = await sql`
        INSERT INTO projects (name, category, priority, description, status)
        VALUES (${name}, ${category || null}, ${priority || 'medium'}, ${description || null}, ${status || 'active'})
        RETURNING *
      `;
      return json(200, { project: rows[0] });
    }

    if (action === 'update_project') {
      const { id, name, category, priority, description, status } = body;
      if (!id) return json(400, { error: 'id required' });
      const rows = await sql`
        UPDATE projects SET
          name        = COALESCE(${name || null}, name),
          category    = COALESCE(${category || null}, category),
          priority    = COALESCE(${priority || null}, priority),
          description = COALESCE(${description || null}, description),
          status      = COALESCE(${status || null}, status),
          updated_at  = now()
        WHERE id = ${id}
        RETURNING *
      `;
      return json(200, { project: rows[0] });
    }

    if (action === 'delete_project') {
      const { id } = body;
      if (!id) return json(400, { error: 'id required' });
      await sql`DELETE FROM projects WHERE id = ${id}`;
      return json(200, { ok: true });
    }

    // ── TASKS ─────────────────────────────────────────────────

    if (action === 'list_tasks') {
      const { project_id, status_filter } = body;
      const rows = await sql`
        SELECT t.*, p.name AS project_name
        FROM tasks t
        JOIN projects p ON t.project_id = p.id
        WHERE (${project_id || null} IS NULL OR t.project_id = ${project_id || null})
          AND (${status_filter || null} IS NULL OR t.status = ${status_filter || null})
        ORDER BY t.priority, t.due_date NULLS LAST, t.updated_at DESC
      `;
      return json(200, { tasks: rows });
    }

    if (action === 'create_task') {
      const { project_id, title, priority, kind, due_date, notes, status } = body;
      if (!project_id || !title) return json(400, { error: 'project_id and title required' });
      const rows = await sql`
        INSERT INTO tasks (project_id, title, priority, kind, due_date, notes, status)
        VALUES (
          ${project_id},
          ${title},
          ${priority || 'medium'},
          ${kind || 'task'},
          ${due_date || null},
          ${notes || null},
          ${status || 'todo'}
        )
        RETURNING *
      `;
      return json(200, { task: rows[0] });
    }

    if (action === 'update_task') {
      const { id, title, priority, kind, due_date, notes, status, project_id } = body;
      if (!id) return json(400, { error: 'id required' });
      const rows = await sql`
        UPDATE tasks SET
          title      = COALESCE(${title || null}, title),
          priority   = COALESCE(${priority || null}, priority),
          kind       = COALESCE(${kind || null}, kind),
          due_date   = COALESCE(${due_date || null}, due_date),
          notes      = COALESCE(${notes || null}, notes),
          status     = COALESCE(${status || null}, status),
          project_id = COALESCE(${project_id || null}, project_id),
          updated_at = now()
        WHERE id = ${id}
        RETURNING *
      `;
      return json(200, { task: rows[0] });
    }

    if (action === 'delete_task') {
      const { id } = body;
      if (!id) return json(400, { error: 'id required' });
      await sql`DELETE FROM tasks WHERE id = ${id}`;
      return json(200, { ok: true });
    }

    return json(400, { error: `Unknown action: ${action}` });

  } catch (err) {
    console.error('workstation fn error:', err);
    return json(500, { error: err.message });
  }
};