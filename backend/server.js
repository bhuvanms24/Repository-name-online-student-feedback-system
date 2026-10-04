const express = require('express'), cors = require('cors'), mongoose = require('mongoose');
const bcrypt = require('bcryptjs'), jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'dev-secret';
const { ObjectId } = mongoose.Schema.Types;

// ---------- Models ----------
const User = mongoose.model('User', new mongoose.Schema({
  name: String, usn: String, email: { type: String, unique: true }, password: String,
  role: { type: String, enum: ['student', 'admin'], default: 'student' },
  courses: [{ type: ObjectId, ref: 'Course' }]
}));
const Course = mongoose.model('Course', new mongoose.Schema({ code: String, name: String, faculty: String }));
const fbSchema = new mongoose.Schema({
  student: { type: ObjectId, ref: 'User' }, course: { type: ObjectId, ref: 'Course' },
  rating: { type: Number, min: 1, max: 5, required: true }, comments: String
}, { timestamps: true });
fbSchema.index({ student: 1, course: 1 }, { unique: true }); // one feedback per course
const Feedback = mongoose.model('Feedback', fbSchema);

// ---------- Middleware ----------
const auth = (role) => (req, res, next) => {
  try {
    const u = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), SECRET);
    if (role && u.role !== role) return res.status(403).json({ error: 'Forbidden' });
    req.user = u; next();
  } catch { res.status(401).json({ error: 'Please login' }); }
};
const sign = (u) => ({
  token: jwt.sign({ id: u._id, role: u.role }, SECRET, { expiresIn: '8h' }),
  user: { name: u.name, role: u.role }
});

const app = express();
app.use(cors(), express.json());

// ---------- Auth ----------
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, usn, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' });
    const u = await User.create({ name, usn, email, password: await bcrypt.hash(password, 10) });
    res.json(sign(u));
  } catch { res.status(400).json({ error: 'Email already registered' }); }
});
app.post('/api/auth/login', async (req, res) => {
  const u = await User.findOne({ email: req.body.email });
  if (!u || !(await bcrypt.compare(req.body.password || '', u.password)))
    return res.status(401).json({ error: 'Invalid credentials' });
  res.json(sign(u));
});

// ---------- Courses ----------
app.get('/api/courses', auth(), async (_, res) => res.json(await Course.find()));
app.get('/api/my-courses', auth('student'), async (req, res) =>
  res.json((await User.findById(req.user.id).populate('courses')).courses));
app.put('/api/my-courses', auth('student'), async (req, res) => {
  await User.findByIdAndUpdate(req.user.id, { courses: req.body.courseIds });
  res.json({ ok: true });
});

// ---------- Feedback ----------
app.post('/api/feedback', auth('student'), async (req, res) => {
  const { course, rating, comments } = req.body;
  const me = await User.findById(req.user.id);
  if (!me.courses.some((c) => c.equals(course))) return res.status(400).json({ error: 'Select this course first' });
  try { await Feedback.create({ student: me._id, course, rating, comments }); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.code === 11000 ? 'Feedback already submitted' : 'Invalid data' }); }
});
app.get('/api/my-feedback', auth('student'), async (req, res) =>
  res.json(await Feedback.find({ student: req.user.id }).select('course')));

// Admin/faculty: anonymous feedback + per-course summary
app.get('/api/admin/feedback', auth('admin'), async (_, res) => {
  const list = await Feedback.find().populate('course').select('-student').sort('-createdAt');
  const summary = await Feedback.aggregate([{ $group: { _id: '$course', avg: { $avg: '$rating' }, count: { $sum: 1 } } }]);
  res.json({ list, summary });
});

// ---------- Start + seed ----------
mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/feedback_db').then(async () => {
  if (!(await Course.countDocuments()))
    await Course.insertMany([
      { code: 'MMCA314D', name: 'Web Development using Full Stack', faculty: 'Dr. Rao' },
      { code: 'MMCA301', name: 'Data Structures', faculty: 'Prof. Meena' },
      { code: 'MMCA305', name: 'Database Management Systems', faculty: 'Dr. Kumar' }]);
  if (!(await User.findOne({ role: 'admin' })))
    await User.create({ name: 'Admin', email: 'admin@dsce.edu', role: 'admin', password: await bcrypt.hash('admin123', 10) });
  app.listen(5000, () => console.log('API on http://localhost:5000'));
});
