import { useState, useEffect } from 'react';
const API = 'http://localhost:5000/api';

export default function App() {
  const [session, setSession] = useState(() => JSON.parse(localStorage.getItem('session') || 'null'));
  const call = async (path, method = 'GET', body) => {
    const r = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json',
      ...(session && { Authorization: 'Bearer ' + session.token }) }, body: body && JSON.stringify(body) });
    const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Error'); return d;
  };
  const login = (s) => { localStorage.setItem('session', JSON.stringify(s)); setSession(s); };
  const logout = () => { localStorage.removeItem('session'); setSession(null); };

  return (<>
    <nav><b>Online Student Feedback System</b>
      {session && <span>{session.user.name} ({session.user.role}) <button onClick={logout}>Logout</button></span>}</nav>
    <main>
      {!session ? <Auth onLogin={login} /> :
        session.user.role === 'admin' ? <AdminView call={call} /> : <StudentView call={call} />}
    </main></>);
}

// ---------- Student authentication ----------
function Auth({ onLogin }) {
  const [reg, setReg] = useState(false), [f, setF] = useState({}), [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async () => {
    try {
      const r = await fetch(`${API}/auth/${reg ? 'register' : 'login'}`, { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error); onLogin(d);
    } catch (e) { setErr(e.message); }
  };
  return (<div className="card"><h3>{reg ? 'Student Registration' : 'Login'}</h3>
    {reg && <><input placeholder="Full name" onChange={set('name')} /><input placeholder="USN" onChange={set('usn')} /></>}
    <input placeholder="Email" onChange={set('email')} />
    <input type="password" placeholder="Password" onChange={set('password')} />
    <p className="err">{err}</p>
    <button onClick={submit}>{reg ? 'Register' : 'Login'}</button>
    <button className="link" onClick={() => { setReg(!reg); setErr(''); }}>{reg ? 'Have an account? Login' : 'New student? Register'}</button>
    <p style={{ fontSize: 12 }}>Admin demo: admin@dsce.edu / admin123</p></div>);
}

// ---------- Course selection + feedback form ----------
function StudentView({ call }) {
  const [all, setAll] = useState([]), [mine, setMine] = useState([]), [done, setDone] = useState([]);
  const [sel, setSel] = useState([]), [active, setActive] = useState(null);
  const load = async () => {
    const [a, m, d] = await Promise.all([call('/courses'), call('/my-courses'), call('/my-feedback')]);
    setAll(a); setMine(m); setSel(m.map((c) => c._id)); setDone(d.map((x) => x.course));
  };
  useEffect(() => { load(); }, []);
  const toggle = (id) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
  const save = async () => { await call('/my-courses', 'PUT', { courseIds: sel }); load(); };

  return (<>
    <div className="card"><h3>1. Select your courses</h3>
      {all.map((c) => <label className="row" key={c._id}>
        <input type="checkbox" checked={sel.includes(c._id)} onChange={() => toggle(c._id)} />
        {c.code} – {c.name} <i>({c.faculty})</i></label>)}
      <br /><button onClick={save}>Save selection</button></div>
    <div className="card"><h3>2. Give feedback</h3>
      {!mine.length && <p>Select and save courses first.</p>}
      {mine.map((c) => <div key={c._id} style={{ marginBottom: 8 }}>{c.name}{' '}
        {done.includes(c._id) ? <span className="ok">✔ Submitted</span> :
          <button onClick={() => setActive(c)}>Give feedback</button>}</div>)}</div>
    {active && <FeedbackForm course={active} call={call} onDone={() => { setActive(null); load(); }} />}</>);
}

function FeedbackForm({ course, call, onDone }) {
  const [rating, setRating] = useState(0), [comments, setComments] = useState(''), [msg, setMsg] = useState('');
  const submit = async () => {
    if (!rating) return setMsg('Please choose a rating');
    try { await call('/feedback', 'POST', { course: course._id, rating, comments }); onDone(); }
    catch (e) { setMsg(e.message); }
  };
  return (<div className="card"><h3>Feedback: {course.name}</h3>
    <div>{[1, 2, 3, 4, 5].map((n) => <span key={n} className={'star' + (n <= rating ? ' on' : '')} onClick={() => setRating(n)}>★</span>)}</div>
    <textarea rows="4" placeholder="Comments (optional)" value={comments} onChange={(e) => setComments(e.target.value)} />
    <p className="err">{msg}</p><button onClick={submit}>Submit</button><button onClick={onDone}>Cancel</button></div>);
}

// ---------- Faculty / Admin view ----------
function AdminView({ call }) {
  const [data, setData] = useState({ list: [], summary: [] });
  useEffect(() => { call('/admin/feedback').then(setData); }, []);
  const stat = (id) => data.summary.find((s) => s._id === id);
  const courses = [...new Map(data.list.map((f) => [f.course._id, f.course])).values()];
  return (<>
    <div className="card"><h3>Course-wise summary</h3>
      {!courses.length && <p>No feedback yet.</p>}
      {courses.map((c) => <p key={c._id}><b>{c.name}</b> ({c.faculty}) — avg ★ {stat(c._id)?.avg.toFixed(2)} from {stat(c._id)?.count} responses</p>)}</div>
    <div className="card"><h3>All feedback (anonymous)</h3>
      {data.list.map((f) => <div key={f._id} style={{ borderBottom: '1px solid #eee', padding: '6px 0' }}>
        <b>{f.course.name}</b> — {'★'.repeat(f.rating)}{'☆'.repeat(5 - f.rating)}<br />{f.comments || <i>No comment</i>}
        <br /><small>{new Date(f.createdAt).toLocaleString()}</small></div>)}</div></>);
}
