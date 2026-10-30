const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const analyzerService = require('./services/analyzerService');
const storageService = require('./services/storageService');
const authService = require('./services/authService');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// MIME 타입 매핑
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function sendJson(res, statusCode, data, extraHeaders = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    ...extraHeaders
  });
  res.end(JSON.stringify(data));
}

function serveStaticFile(res, filePath) {
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
}

function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error('Payload Too Large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

// 요청에서 인증 토큰 및 사용자 추출
function getAuthUser(req) {
  const authHeader = req.headers['authorization'] || '';
  let token = '';

  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.headers['cookie']) {
    const cookies = req.headers['cookie'].split(';');
    for (const c of cookies) {
      const [k, v] = c.trim().split('=');
      if (k === 'knup_session') {
        token = v;
        break;
      }
    }
  }

  if (!token) return null;
  return authService.getUserByToken(token);
}

// HTTP 서버 인스턴스 생성
const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const currentUser = getAuthUser(req);

  try {
    // ----------------------------------------------------
    // [인증 API] 환자 회원가입, 로그인, 로그아웃, 현재 사용자
    // ----------------------------------------------------
    
    // POST /api/auth/register
    if (req.method === 'POST' && pathname === '/api/auth/register') {
      const payload = await parseRequestBody(req);
      try {
        const { user, token } = authService.register(payload);
        return sendJson(res, 201, { user, token });
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    }

    // POST /api/auth/login
    if (req.method === 'POST' && pathname === '/api/auth/login') {
      const payload = await parseRequestBody(req);
      try {
        const { user, token } = authService.login(payload.username, payload.password);
        return sendJson(res, 200, { user, token });
      } catch (err) {
        return sendJson(res, 401, { error: err.message });
      }
    }

    // POST /api/auth/logout
    if (req.method === 'POST' && pathname === '/api/auth/logout') {
      const authHeader = req.headers['authorization'] || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '';
      authService.logout(token);
      return sendJson(res, 200, { success: true, message: '로그아웃되었습니다.' });
    }

    // GET /api/auth/me
    if (req.method === 'GET' && pathname === '/api/auth/me') {
      if (!currentUser) {
        return sendJson(res, 200, { user: null });
      }
      return sendJson(res, 200, { user: currentUser });
    }

    // ----------------------------------------------------
    // [약물 API] 검색, 자동 스케줄 추천
    // ----------------------------------------------------

    // GET /api/drugs/search?q=...
    if (req.method === 'GET' && pathname === '/api/drugs/search') {
      const query = (parsedUrl.query.q || '').trim().toLowerCase();
      if (!query) {
        return sendJson(res, 200, analyzerService.knowledgeBase.drugs.slice(0, 10));
      }

      const results = analyzerService.knowledgeBase.drugs.filter(d => 
        d.name.toLowerCase().includes(query) ||
        (d.aliases && d.aliases.some(a => a.toLowerCase().includes(query))) ||
        d.category.toLowerCase().includes(query)
      );

      return sendJson(res, 200, results);
    }

    // GET /api/drugs/auto-schedule?name=... (스마트 자동 복약시간 추론)
    if (req.method === 'GET' && pathname === '/api/drugs/auto-schedule') {
      const medName = (parsedUrl.query.name || '').trim();
      const matched = analyzerService.findDrugInfo(medName);
      const schedule = analyzerService.inferOptimalSchedule(matched, medName);
      return sendJson(res, 200, schedule);
    }

    // ----------------------------------------------------
    // [복약지도 API] 생성 (환자 본인 계정 바인딩)
    // ----------------------------------------------------

    // POST /api/guidance
    if (req.method === 'POST' && pathname === '/api/guidance') {
      const payload = await parseRequestBody(req);
      const userId = currentUser ? currentUser.id : "usr_guest";

      // 프로필에 환자 이름 누락 시 로그인 사용자 이름 자동 적용
      if (!payload.patientName && currentUser) {
        payload.patientName = currentUser.name;
        payload.gender = currentUser.gender;
        payload.age = currentUser.age;
        payload.weight = currentUser.weight;
      }

      const guidance = analyzerService.generateMedicationGuidance(payload);
      const savedRecord = storageService.addRecord(guidance, userId);

      // 환자 프로필 업데이트
      if (currentUser) {
        authService.updateUserProfile(currentUser.id, {
          age: guidance.age,
          weight: guidance.weight,
          conditions: guidance.conditions
        });
      }

      return sendJson(res, 201, savedRecord);
    }

    // ----------------------------------------------------
    // [이력 관리 API] 환자 본인의 기록만 격리 조회 및 삭제
    // ----------------------------------------------------

    // GET /api/history
    if (req.method === 'GET' && pathname === '/api/history') {
      const userId = currentUser ? currentUser.id : "usr_guest";
      const records = storageService.getAllRecords(userId);
      return sendJson(res, 200, records);
    }

    // GET /api/history/:id
    if (req.method === 'GET' && pathname.startsWith('/api/history/')) {
      const id = pathname.replace('/api/history/', '').trim();
      const userId = currentUser ? currentUser.id : "usr_guest";
      const record = storageService.getRecordById(id, userId);

      if (!record) {
        return sendJson(res, 404, { error: '기록을 찾을 수 없거나 열람 권한이 없습니다.' });
      }
      return sendJson(res, 200, record);
    }

    // DELETE /api/history/:id
    if (req.method === 'DELETE' && pathname.startsWith('/api/history/')) {
      const id = pathname.replace('/api/history/', '').trim();
      const userId = currentUser ? currentUser.id : "usr_guest";
      const success = storageService.deleteRecord(id, userId);

      if (!success) {
        return sendJson(res, 403, { error: '삭제할 수 없거나 삭제 권한이 없습니다.' });
      }
      return sendJson(res, 200, { success: true, message: '본인의 이력이 안전하게 삭제되었습니다.' });
    }

    // ----------------------------------------------------
    // [정적 웹 파일 서빙]
    // ----------------------------------------------------
    let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      return res.end('403 Forbidden');
    }

    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        serveStaticFile(res, path.join(PUBLIC_DIR, 'index.html'));
      } else {
        serveStaticFile(res, filePath);
      }
    });

  } catch (error) {
    console.error('[Server Error]', error);
    sendJson(res, 500, { error: '서버 내부 오류가 발생했습니다.', detail: error.message });
  }
});

function startServer() {
  server.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`🌿 [KNUP 개인 맞춤형 복약지도 v2.0] 서버가 실행되었습니다!`);
    console.log(`🌐 접속 주소: http://localhost:${PORT}`);
    console.log(`🔒 개인정보 격리: 환자 본인 계정 전용 이력 보관 지원`);
    console.log(`⏰ 스마트 스케줄러: 하루 다회 복용 및 자동 시간 추천 활성화`);
    console.log(`=======================================================`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { server, startServer };
