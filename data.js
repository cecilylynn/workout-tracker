/* ─────────────────────────────────────────
   DATA.JS — Supabase CRUD helpers
   ───────────────────────────────────────── */

let _supabase = null;

function isConfigured() {
  return SUPABASE_URL && !SUPABASE_URL.includes('your-project-id');
}

function getClient() {
  if (!_supabase) {
    _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return _supabase;
}

// ── Date Helpers ──────────────────────────

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function startOfWeek() {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay()); // Sunday
  return d.toISOString().split('T')[0];
}

function startOfMonth() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().split('T')[0];
}

function startOfYear() {
  const d = new Date();
  d.setMonth(0, 1);
  return d.toISOString().split('T')[0];
}

// ── Exercises ─────────────────────────────

async function getAllExercises() {
  const { data, error } = await getClient()
    .from('exercises')
    .select('*')
    .order('name');
  return { data: data || [], error };
}

async function addExercise(name, type) {
  const unit = type === 'cardio' ? 'min' : 'lbs';
  const { data, error } = await getClient()
    .from('exercises')
    .insert({ name: name.trim(), type, unit })
    .select()
    .single();
  return { data, error };
}

async function updateExercise(id, name, type) {
  const unit = type === 'cardio' ? 'min' : 'lbs';
  const { data, error } = await getClient()
    .from('exercises')
    .update({ name: name.trim(), type, unit })
    .eq('id', id)
    .select()
    .single();
  return { data, error };
}

async function deleteExercise(id) {
  // Check if any entries reference this exercise
  const { count } = await getClient()
    .from('entries')
    .select('id', { count: 'exact', head: true })
    .eq('exercise_id', id);
  if (count > 0) {
    return { error: { message: 'This exercise has logged sessions. Delete those entries first.' } };
  }
  const { error } = await getClient().from('exercises').delete().eq('id', id);
  return { error };
}

// ── Sessions ──────────────────────────────

async function createSession(date) {
  const { data, error } = await getClient()
    .from('sessions')
    .insert({ date: date || todayISO() })
    .select()
    .single();
  return { data, error };
}

async function getActiveSession() {
  const sessionId = localStorage.getItem('activeSessionId');
  if (!sessionId) return { data: null };
  const { data, error } = await getClient()
    .from('sessions')
    .select('*')
    .eq('id', sessionId)
    .single();
  if (error || !data) {
    localStorage.removeItem('activeSessionId');
    return { data: null };
  }
  return { data };
}

function setActiveSession(sessionId) {
  if (sessionId) localStorage.setItem('activeSessionId', sessionId);
  else localStorage.removeItem('activeSessionId');
}

async function getSessionEntries(sessionId) {
  const { data, error } = await getClient()
    .from('entries')
    .select('*, exercises(id, name, type, unit)')
    .eq('session_id', sessionId)
    .order('created_at');
  return { data: data || [], error };
}

async function deleteSession(sessionId) {
  const { error } = await getClient().from('sessions').delete().eq('id', sessionId);
  return { error };
}

// ── Entries ───────────────────────────────

async function addEntry(sessionId, exerciseId, value) {
  const { data, error } = await getClient()
    .from('entries')
    .insert({ session_id: sessionId, exercise_id: exerciseId, value: parseFloat(value) })
    .select('*, exercises(id, name, type, unit)')
    .single();
  return { data, error };
}

async function updateEntry(entryId, value) {
  const { data, error } = await getClient()
    .from('entries')
    .update({ value: parseFloat(value) })
    .eq('id', entryId)
    .select('*, exercises(id, name, type, unit)')
    .single();
  return { data, error };
}

async function deleteEntry(entryId) {
  const { error } = await getClient().from('entries').delete().eq('id', entryId);
  return { error };
}

// ── Home Stats ────────────────────────────

async function getHomeCounts() {
  const db = getClient();
  const [week, month, year] = await Promise.all([
    db.from('sessions').select('id', { count: 'exact', head: true }).gte('date', startOfWeek()),
    db.from('sessions').select('id', { count: 'exact', head: true }).gte('date', startOfMonth()),
    db.from('sessions').select('id', { count: 'exact', head: true }).gte('date', startOfYear()),
  ]);
  return {
    week:  week.count  || 0,
    month: month.count || 0,
    year:  year.count  || 0,
  };
}

async function getLastSession() {
  const { data, error } = await getClient()
    .from('sessions')
    .select('*, entries(*, exercises(name, type, unit))')
    .order('date', { ascending: false })
    .limit(1)
    .single();
  return { data: data || null, error };
}

// ── History ───────────────────────────────

async function getAllSessions(filter) {
  let query = getClient()
    .from('sessions')
    .select('*, entries(*, exercises(id, name, type, unit))')
    .order('date', { ascending: false });

  if (filter === 'week')  query = query.gte('date', startOfWeek());
  if (filter === 'month') query = query.gte('date', startOfMonth());

  const { data, error } = await query;
  return { data: data || [], error };
}

// ── Stats ─────────────────────────────────

async function getExerciseStats() {
  // Returns exercises with session count, best, and average
  const { data: exercises } = await getAllExercises();
  if (!exercises.length) return { data: [] };

  const { data: entries } = await getClient()
    .from('entries')
    .select('exercise_id, value');

  const statsMap = {};
  (entries || []).forEach(e => {
    if (!statsMap[e.exercise_id]) statsMap[e.exercise_id] = { count: 0, sum: 0, best: 0 };
    statsMap[e.exercise_id].count++;
    statsMap[e.exercise_id].sum += parseFloat(e.value);
    if (parseFloat(e.value) > statsMap[e.exercise_id].best) {
      statsMap[e.exercise_id].best = parseFloat(e.value);
    }
  });

  const result = exercises.map(ex => ({
    ...ex,
    count: statsMap[ex.id]?.count || 0,
    best:  statsMap[ex.id]?.best  || 0,
    avg:   statsMap[ex.id]?.count ? (statsMap[ex.id].sum / statsMap[ex.id].count) : 0,
  }));

  return { data: result };
}

async function getExerciseHistory(exerciseId) {
  const { data, error } = await getClient()
    .from('entries')
    .select('value, sessions(date)')
    .eq('exercise_id', exerciseId)
    .order('created_at');

  const points = (data || []).map(e => ({
    date:  e.sessions.date,
    value: parseFloat(e.value),
  })).sort((a, b) => a.date.localeCompare(b.date));

  return { data: points, error };
}

// ── Data Management ───────────────────────

async function exportAllData() {
  const db = getClient();
  const [{ data: sessions }, { data: exercises }] = await Promise.all([
    db.from('sessions').select('*, entries(*, exercises(name, type, unit))').order('date', { ascending: false }),
    db.from('exercises').select('*').order('name'),
  ]);

  const rows = [['Date', 'Exercise', 'Type', 'Value', 'Unit']];
  (sessions || []).forEach(s => {
    (s.entries || []).forEach(e => {
      rows.push([s.date, e.exercises.name, e.exercises.type, e.value, e.exercises.unit]);
    });
  });

  return rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
}

async function clearAllData() {
  const db = getClient();
  await db.from('entries').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await db.from('sessions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  setActiveSession(null);
}
