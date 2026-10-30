const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const usersFilePath = path.join(__dirname, '..', 'data', 'users.json');

// 활성 세션 스토리지 (메모리 및 영속 지원)
const activeSessions = new Map(); // token -> userId

function loadUsers() {
  try {
    if (!fs.existsSync(usersFilePath)) {
      const initialUsers = [
        {
          id: "usr_patient01",
          username: "patient01",
          passwordHash: hashPassword("1234"),
          name: "김철수",
          gender: "남성",
          age: 58,
          weight: 74,
          conditions: ["고혈압", "고지혈증"],
          createdAt: new Date().toISOString()
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
          createdAt: new Date().toISOString()
        }
      ];
      fs.writeFileSync(usersFilePath, JSON.stringify(initialUsers, null, 2), 'utf8');
      return initialUsers;
    }
    const data = fs.readFileSync(usersFilePath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('[Auth Error] Failed to load users:', err);
    return [];
  }
}

function saveUsers(users) {
  try {
    fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('[Auth Error] Failed to save users:', err);
    return false;
  }
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// 회원가입
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

  users.push(newUser);
  saveUsers(users);

  // 자동 로그인 토큰 발급
  const token = createSession(newUser.id);
  const { passwordHash, ...safeUser } = newUser;
  return { user: safeUser, token };
}

// 로그인
function login(username, password) {
  const users = loadUsers();
  const cleanUsername = (username || '').trim().toLowerCase();
  const user = users.find(u => u.username.toLowerCase() === cleanUsername);

  if (!user || user.passwordHash !== hashPassword(password)) {
    throw new Error('아이디 또는 비밀번호가 일치하지 않습니다.');
  }

  const token = createSession(user.id);
  const { passwordHash, ...safeUser } = user;
  return { user: safeUser, token };
}

function createSession(userId) {
  const token = `knup_tk_${crypto.randomBytes(24).toString('hex')}`;
  activeSessions.set(token, {
    userId,
    createdAt: Date.now()
  });
  return token;
}

function getUserByToken(token) {
  if (!token) return null;
  const session = activeSessions.get(token);
  if (!session) return null;

  const users = loadUsers();
  const user = users.find(u => u.id === session.userId);
  if (!user) return null;

  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

function logout(token) {
  if (token) {
    activeSessions.delete(token);
  }
  return true;
}

// 사용자 프로필 정보 갱신 (예: 최근 입력한 나이, 체중, 질환 업데이트)
function updateUserProfile(userId, profileData) {
  const users = loadUsers();
  const idx = users.findIndex(u => u.id === userId);
  if (idx !== -1) {
    users[idx] = { ...users[idx], ...profileData };
    saveUsers(users);
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
