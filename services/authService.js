const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const usersFilePath = path.join(__dirname, '..', 'data', 'users.json');

const SESSION_SECRET = process.env.SESSION_SECRET || 'pharmacy-demo-secret-change-me';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function getDemoUsers() {
  return [
    {
      id: "usr_patient01",
      username: "patient01",
      passwordHash: hashPassword("1234"),
      name: "김철수",
      gender: "남성",
      age: 58,
      weight: 74,
      conditions: ["고혈압", "고지혈증"],
      createdAt: "2026-01-01T00:00:00.000Z"
    },
    {
      id: "usr_patient02",
      username: "patient02",
      passwordHash: hashPassword("1234"),
      name: "이영희",
      gender: "여성",
      age: 62,
      weight: 59,
      conditions: ["당뇨병", "만성 위염/역류성 식도염"],
      createdAt: "2026-01-01T00:00:00.000Z"
    }
  ];
}

function loadUsers() {
  const demo = getDemoUsers();
  try {
    if (!fs.existsSync(usersFilePath)) return demo;
    const fileUsers = JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
    if (!Array.isArray(fileUsers)) return demo;
    const extra = fileUsers.filter(u => !demo.some(d => d.username === u.username));
    return [...demo, ...extra];
  } catch (err) {
    console.error('[Auth Error] Failed to load users:', err.message);
    return demo;
  }
}

function saveUsers(users) {
  try {
    fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('[Auth Warn] Cannot save users (read-only environment):', err.message);
    return false;
  }
}

function sign(data) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
}

function createSession(user) {
  const { passwordHash, ...safeUser } = user;
  const payload = Buffer.from(JSON.stringify({
    uid: user.id,
    user: safeUser,
    exp: Date.now() + SESSION_TTL_MS
  })).toString('base64url');
  return `knup_tk_${payload}.${sign(payload)}`;
}

function readToken(token) {
  try {
    if (!token || !token.startsWith('knup_tk_')) return null;
    const [payload, signature] = token.slice('knup_tk_'.length).split('.');
    if (!payload || !signature) return null;

    const expected = sign(payload);
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.exp || data.exp < Date.now()) return null;
    return data;
  } catch (err) {
    return null;
  }
}

function register({ username, password, name, gender = '남성', age = 40, weight = 60, conditions = [] }) {
  const users = loadUsers();
  const cleanUsername = (username || '').trim().toLowerCase();

  if (!cleanUsername || !password || !name) {
    throw new Error('아이디, 비밀번호, 이름은 필수 입력 항목입니다.');
  }

  if (users.some(u => u.username.toLowerCase() === cleanUsername)) {
    throw new Error('이미 존재하는 아이디입니다.');
  }

  const newUser = {
    id: `usr_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    username: cleanUsername,
    passwordHash: hashPassword(password),
    name: name.trim(),
    gender: gender === 'F' || gender === '여성' ? '여성' : '남성',
    age: parseInt(age, 10) || 40,
    weight: parseFloat(weight) || 60,
    conditions: Array.isArray(conditions) ? conditions : [],
    createdAt: new Date().toISOString()
  };

  const demoIds = getDemoUsers().map(d => d.id);
  const userList = loadUsers().filter(u => !demoIds.includes(u.id));
  userList.push(newUser);
  saveUsers(userList);

  const token = createSession(newUser);
  const { passwordHash, ...safeUser } = newUser;
  return { user: safeUser, token };
}

function login(username, password) {
  const users = loadUsers();
  const cleanUsername = (username || '').trim().toLowerCase();
  const user = users.find(u => u.username.toLowerCase() === cleanUsername);

  if (!user || user.passwordHash !== hashPassword(password || '')) {
    throw new Error('아이디 또는 비밀번호가 일치하지 않습니다.');
  }

  const token = createSession(user);
  const { passwordHash, ...safeUser } = user;
  return { user: safeUser, token };
}

function getUserByToken(token) {
  const data = readToken(token);
  if (!data) return null;

  const users = loadUsers();
  const user = users.find(u => u.id === data.uid);
  if (user) {
    const { passwordHash, ...safeUser } = user;
    return safeUser;
  }
  return data.user || null;
}

function logout(token) {
  return true;
}

function updateUserProfile(userId, profileData) {
  const users = loadUsers();
  const idx = users.findIndex(u => u.id === userId);
  if (idx !== -1) {
    users[idx] = { ...users[idx], ...profileData };
    const demoIds = getDemoUsers().map(d => d.id);
    saveUsers(users.filter(u => !demoIds.includes(u.id)));
  }
}

module.exports = {
  register,
  login,
  logout,
  getUserByToken,
  updateUserProfile,
  loadUsers
};
