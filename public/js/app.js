/**
 * KNUP 개인 맞춤형 복약지도 v2.0 - 메인 클라이언트 스크립트 (app.js)
 */

const state = {
  currentUser: null,
  selectedConditions: new Set(),
  medications: [], // { name, frequency, timings: [], isAutoScheduled: boolean }
  currentRecord: null,
  dailyCheckStatus: {},
  currentManualFreq: '1일 1회'
};

document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  initEventListeners();
  initAutocomplete();
});

// -------------------------------------------------------------------
// 1. 환자 인증 (Authentication) 및 개인정보 보호
// -------------------------------------------------------------------
async function initAuth() {
  const token = localStorage.getItem('knup_token');
  if (token) {
    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.user) {
        setLoggedInUser(data.user);
        return;
      }
    } catch (e) {
      console.warn('Auth verify failed:', e);
    }
  }

  // 초기 접속 시 데모 편의성을 위해 자동 로그인 안내 또는 게스트 상태
  renderHeaderUserArea(null);
}

function setLoggedInUser(user) {
  state.currentUser = user;
  renderHeaderUserArea(user);

  // 폼에 환자 기본 정보 자동 주입
  const nameInput = document.getElementById('patient-name');
  if (nameInput && !nameInput.value) {
    nameInput.value = user.name || '';
    if (user.gender === '여성' || user.gender === 'F') {
      const femaleRadio = document.querySelector('input[name="gender"][value="F"]');
      if (femaleRadio) femaleRadio.checked = true;
    } else {
      const maleRadio = document.querySelector('input[name="gender"][value="M"]');
      if (maleRadio) maleRadio.checked = true;
    }
    document.getElementById('patient-age').value = user.age || '';
    document.getElementById('patient-weight').value = user.weight || '';

    // 환자 기본 질환 자동 활성화
    if (user.conditions && Array.isArray(user.conditions)) {
      user.conditions.forEach(c => {
        state.selectedConditions.add(c);
        const chips = document.querySelectorAll('.disease-chip');
        chips.forEach(chip => {
          if (chip.textContent.trim() === c) {
            chip.classList.add('bg-emerald-50', 'border-emerald-500', 'text-emerald-700', 'font-bold');
          }
        });
      });
    }
  }

  // 본인 이력 배지 카운트 갱신
  fetch('/api/history', {
    headers: { 'Authorization': `Bearer ${localStorage.getItem('knup_token')}` }
  })
  .then(r => r.json())
  .then(list => {
    if (Array.isArray(list)) updateHistoryBadge(list.length);
  })
  .catch(() => {});
}

function renderHeaderUserArea(user) {
  const area = document.getElementById('header-user-area');
  const hintEl = document.getElementById('login-status-hint');

  if (user) {
    area.innerHTML = `
      <div class="flex items-center space-x-2">
        <span class="text-xs bg-emerald-800/60 border border-emerald-400/40 px-2.5 py-1 rounded-xl text-emerald-100 font-bold hidden sm:inline-flex items-center gap-1">
          <i class="fa-solid fa-user-check text-emerald-300"></i> ${escapeHtml(user.name)} 환자님
        </span>
        <button onclick="openHistoryModal()" class="px-3 py-1.5 text-xs font-semibold bg-white/20 hover:bg-white/30 rounded-xl transition flex items-center gap-1 border border-white/20 shadow-sm">
          <i class="fa-solid fa-clock-rotate-left"></i>
          <span>내 복약 기록</span>
          <span id="history-badge" class="bg-amber-400 text-slate-900 text-[10px] px-1.5 py-0.2 rounded-full font-bold ml-0.5 hidden">0</span>
        </button>
        <button onclick="handleLogout()" class="px-2.5 py-1.5 text-xs text-emerald-100 hover:text-white bg-black/20 hover:bg-black/30 rounded-xl transition" title="로그아웃">
          <i class="fa-solid fa-right-from-bracket"></i>
        </button>
      </div>
    `;

    if (hintEl) {
      hintEl.innerHTML = `
        <i class="fa-solid fa-lock text-emerald-600"></i>
        <span><strong>${escapeHtml(user.name)}</strong> 환자 전용 보관 모드 (타인에게 기록 노출 안 됨)</span>
      `;
    }
  } else {
    area.innerHTML = `
      <button onclick="openAuthModal()" class="px-3.5 py-1.5 text-xs sm:text-sm font-bold bg-white text-emerald-800 hover:bg-emerald-50 rounded-xl transition shadow-sm flex items-center gap-1.5">
        <i class="fa-solid fa-right-to-bracket"></i>
        <span>환자 로그인 / 회원가입</span>
      </button>
    `;

    if (hintEl) {
      hintEl.innerHTML = `
        <i class="fa-solid fa-circle-info text-amber-500"></i>
        <span>현재 게스트 모드입니다. <button type="button" onclick="openAuthModal()" class="text-emerald-700 font-bold underline ml-1">로그인</button>하시면 내 기록만 안전하게 보관됩니다.</span>
      `;
    }
  }
}

function openAuthModal() {
  // 모달 열 때 이전 입력값 모두 초기화 (재로그인 방지)
  document.getElementById('login-username').value = '';
  document.getElementById('login-password').value = '';
  document.getElementById('reg-username').value = '';
  document.getElementById('reg-password').value = '';
  document.getElementById('reg-name').value = '';
  switchAuthTab('login');
  document.getElementById('auth-modal').classList.remove('hidden');
}

function closeAuthModal() {
  document.getElementById('auth-modal').classList.add('hidden');
}

function switchAuthTab(tab) {
  const loginForm = document.getElementById('login-form');
  const regForm = document.getElementById('register-form');
  const btnLogin = document.getElementById('tab-btn-login');
  const btnReg = document.getElementById('tab-btn-register');

  if (tab === 'login') {
    loginForm.classList.remove('hidden');
    regForm.classList.add('hidden');
    btnLogin.className = 'py-2 rounded-lg bg-white shadow-sm text-emerald-800 font-bold';
    btnReg.className = 'py-2 rounded-lg text-slate-600 font-medium';
  } else {
    loginForm.classList.add('hidden');
    regForm.classList.remove('hidden');
    btnLogin.className = 'py-2 rounded-lg text-slate-600 font-medium';
    btnReg.className = 'py-2 rounded-lg bg-white shadow-sm text-emerald-800 font-bold';
  }
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const u = document.getElementById('login-username').value.trim();
  const p = document.getElementById('login-password').value;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u, password: p })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '로그인 실패');

    localStorage.setItem('knup_token', data.token);
    setLoggedInUser(data.user);
    closeAuthModal();
  } catch (err) {
    alert(err.message);
  }
}

async function quickLoginDemo(username, password) {
  document.getElementById('login-username').value = username;
  document.getElementById('login-password').value = password;
  document.getElementById('login-form').dispatchEvent(new Event('submit'));
}

async function handleRegisterSubmit(e) {
  e.preventDefault();
  const u = document.getElementById('reg-username').value.trim();
  const p = document.getElementById('reg-password').value;
  const name = document.getElementById('reg-name').value.trim();
  const gender = document.getElementById('reg-gender').value;
  const age = document.getElementById('reg-age').value;
  const weight = document.getElementById('reg-weight').value;

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u, password: p, name, gender, age, weight })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '회원가입 실패');

    localStorage.setItem('knup_token', data.token);
    setLoggedInUser(data.user);
    closeAuthModal();
    alert(`${data.user.name} 환자님, 회원가입이 완료되었습니다!`);
  } catch (err) {
    alert(err.message);
  }
}

function handleLogout() {
  const token = localStorage.getItem('knup_token');
  if (token) {
    fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    }).catch(() => {});
  }
  localStorage.removeItem('knup_token');
  state.currentUser = null;
  renderHeaderUserArea(null);
  resetToNewForm();

  // 로그인/회원가입 폼 입력값 강제 초기화
  document.getElementById('login-username').value = '';
  document.getElementById('login-password').value = '';
  document.getElementById('reg-username').value = '';
  document.getElementById('reg-password').value = '';
  document.getElementById('reg-name').value = '';
}

// -------------------------------------------------------------------
// 2. 이벤트 리스너 및 UI 컴포넌트 핸들링
// -------------------------------------------------------------------
function initEventListeners() {
  const customCondInput = document.getElementById('custom-condition-input');
  if (customCondInput) {
    customCondInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addCustomCondition();
      }
    });
  }

  const medInput = document.getElementById('med-search-input');
  if (medInput) {
    medInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAddMedication();
      }
    });
  }
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// 기저질환 칩 토글
function toggleDiseaseChip(btn, disease) {
  if (state.selectedConditions.has(disease)) {
    state.selectedConditions.delete(disease);
    btn.classList.remove('bg-emerald-50', 'border-emerald-500', 'text-emerald-700', 'font-bold');
    btn.classList.add('border-slate-200');
  } else {
    state.selectedConditions.add(disease);
    btn.classList.add('bg-emerald-50', 'border-emerald-500', 'text-emerald-700', 'font-bold');
    btn.classList.remove('border-slate-200');
  }
}

function addCustomCondition() {
  const input = document.getElementById('custom-condition-input');
  const val = input.value.trim();
  if (!val) return;

  if (state.selectedConditions.has(val)) {
    alert('이미 추가된 질환입니다.');
    return;
  }

  state.selectedConditions.add(val);
  const container = document.getElementById('disease-chips');
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'disease-chip px-3 py-1.5 text-xs sm:text-sm rounded-full border border-emerald-500 bg-emerald-50 text-emerald-700 font-bold transition flex items-center gap-1';
  chip.innerHTML = `${escapeHtml(val)} <i class="fa-solid fa-xmark text-xs opacity-60 hover:opacity-100 ml-1"></i>`;
  chip.onclick = function() {
    state.selectedConditions.delete(val);
    chip.remove();
  };
  container.appendChild(chip);
  input.value = '';
}

// -------------------------------------------------------------------
// 3. 스마트 자동 추천 토글 & 복용 횟수 선택기
// -------------------------------------------------------------------
function toggleAutoScheduleMode(isAuto) {
  const manualArea = document.getElementById('manual-schedule-area');
  const toggleBg = document.getElementById('toggle-bg');
  const toggleDot = document.getElementById('toggle-dot');
  const toggleText = document.getElementById('toggle-text');

  if (isAuto) {
    manualArea.classList.add('hidden');
    toggleBg.classList.replace('bg-slate-300', 'bg-emerald-600');
    toggleDot.classList.add('translate-x-5');
    toggleText.textContent = "자동 추천 ON";
    toggleText.className = "ml-2 text-xs font-bold text-emerald-800";
  } else {
    manualArea.classList.remove('hidden');
    toggleBg.classList.replace('bg-emerald-600', 'bg-slate-300');
    toggleDot.classList.remove('translate-x-5');
    toggleText.textContent = "직접 지정";
    toggleText.className = "ml-2 text-xs font-semibold text-slate-500";
  }
}

function selectFrequency(freq) {
  state.currentManualFreq = freq;
  const chips = document.querySelectorAll('.freq-chip');
  chips.forEach(c => {
    if (c.textContent.trim() === freq) {
      c.className = 'freq-chip py-1.5 text-xs rounded-lg border border-emerald-500 bg-emerald-50 text-emerald-700 font-bold';
    } else {
      c.className = 'freq-chip py-1.5 text-xs rounded-lg border border-slate-200 hover:border-emerald-400 text-slate-700';
    }
  });

  // 복용 횟수에 따른 기본 체크박스 추천
  const checkboxes = document.querySelectorAll('input[name="manual_timing"]');
  checkboxes.forEach(cb => cb.checked = false);

  if (freq === '1일 1회') {
    checkTimingCheckbox('morning_after');
  } else if (freq === '1일 2회') {
    checkTimingCheckbox('morning_after');
    checkTimingCheckbox('evening_after');
  } else if (freq === '1일 3회') {
    checkTimingCheckbox('morning_after');
    checkTimingCheckbox('lunch_after');
    checkTimingCheckbox('evening_after');
  } else if (freq === '1일 4회') {
    checkTimingCheckbox('morning_after');
    checkTimingCheckbox('lunch_after');
    checkTimingCheckbox('evening_after');
    checkTimingCheckbox('bedtime');
  }
}

function checkTimingCheckbox(val) {
  const el = document.querySelector(`input[name="manual_timing"][value="${val}"]`);
  if (el) el.checked = true;
}

// -------------------------------------------------------------------
// 4. 약품명 자동완성 및 약물 추가
// -------------------------------------------------------------------
function initAutocomplete() {
  const input = document.getElementById('med-search-input');
  const list = document.getElementById('autocomplete-list');
  if (!input || !list) return;

  let debounceTimer = null;

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const query = input.value.trim();

    if (query.length < 1) {
      list.innerHTML = '';
      list.classList.add('hidden');
      return;
    }

    debounceTimer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/drugs/search?q=${encodeURIComponent(query)}`);
        const drugs = await res.json();

        if (drugs.length === 0) {
          list.innerHTML = `<div class="p-3 text-xs text-slate-400 text-center">일치하는 약품 정보가 없습니다. (직접 입력 가능)</div>`;
          list.classList.remove('hidden');
          return;
        }

        list.innerHTML = drugs.map(d => {
          const hasDrowsy = (d.criticalWarnings || []).some(w => w.type === 'drowsiness');
          return `
            <div class="px-3.5 py-2.5 text-xs hover:bg-emerald-50 cursor-pointer border-b border-slate-100 last:border-b-0" onclick="selectAutocompleteItem('${escapeHtml(d.name)}')">
              <div class="flex items-center justify-between">
                <span class="font-bold text-slate-900">${escapeHtml(d.name)}</span>
                <div class="flex items-center gap-1">
                  ${hasDrowsy ? `<span class="text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.2 rounded">😴 졸림주의</span>` : ''}
                  <span class="text-[11px] text-slate-400">${escapeHtml(d.category)}</span>
                </div>
              </div>
              <p class="text-[11px] text-slate-500 truncate mt-0.5">${escapeHtml(d.efficacy)}</p>
            </div>
          `;
        }).join('');
        list.classList.remove('hidden');
      } catch (err) {
        console.error(err);
      }
    }, 180);
  });

  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !list.contains(e.target)) {
      list.classList.add('hidden');
    }
  });
}

function selectAutocompleteItem(name) {
  const input = document.getElementById('med-search-input');
  input.value = name;
  document.getElementById('autocomplete-list').classList.add('hidden');
  input.focus();
}

function handleAddMedication() {
  const input = document.getElementById('med-search-input');
  const name = input.value.trim();
  const isAuto = document.getElementById('auto-schedule-toggle').checked;

  if (!name) {
    alert('추가할 약품명을 입력하세요.');
    input.focus();
    return;
  }

  if (state.medications.some(m => m.name.toLowerCase() === name.toLowerCase())) {
    alert('이미 등록된 약물입니다.');
    return;
  }

  let timings = [];
  let frequency = state.currentManualFreq;

  if (!isAuto) {
    const checkedTimings = Array.from(document.querySelectorAll('input[name="manual_timing"]:checked')).map(cb => cb.value);
    if (checkedTimings.length === 0) {
      alert('최소 1개 이상의 복용 시간대를 선택해 주세요.');
      return;
    }
    timings = checkedTimings;
  }

  state.medications.push({
    name,
    frequency: isAuto ? '자동추천' : frequency,
    timings,
    isAutoScheduled: isAuto
  });

  input.value = '';
  document.getElementById('autocomplete-list').classList.add('hidden');
  renderAddedMedsList();
}

function quickAddMed(name) {
  if (state.medications.some(m => m.name.toLowerCase() === name.toLowerCase())) {
    alert(`${name}은(는) 이미 등록되어 있습니다.`);
    return;
  }
  state.medications.push({
    name,
    frequency: '자동추천',
    timings: [],
    isAutoScheduled: true
  });
  renderAddedMedsList();
}

function renderAddedMedsList() {
  const container = document.getElementById('added-meds-list');
  const countBadge = document.getElementById('med-count-badge');
  countBadge.textContent = state.medications.length;

  if (state.medications.length === 0) {
    container.innerHTML = `
      <div id="empty-med-msg" class="py-8 text-center text-slate-400 text-sm border-2 border-dashed border-emerald-200/60 rounded-2xl bg-white/50">
        <i class="fa-solid fa-prescription-bottle-medical text-3xl mb-2 text-emerald-300 block"></i>
        등록된 약물이 없습니다. 약품명을 입력하고 [약물 목록에 추가하기]를 눌러주세요.
      </div>
    `;
    return;
  }

  const timingLabels = {
    morning_before: "아침 식전",
    morning_after: "아침 식후",
    lunch_after: "점심 식후",
    evening_after: "저녁 식후",
    bedtime: "취침 전"
  };

  container.innerHTML = state.medications.map((med, idx) => {
    let timingBadge = '';
    if (med.isAutoScheduled) {
      timingBadge = `<span class="text-xs px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold flex items-center gap-1"><i class="fa-solid fa-wand-magic-sparkles text-[10px]"></i> 시간 자동 추천</span>`;
    } else {
      const formatted = (med.timings || []).map(t => timingLabels[t] || t).join(', ');
      timingBadge = `<span class="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-semibold">${med.frequency} (${formatted})</span>`;
    }

    return `
      <div class="flex items-center justify-between p-3.5 bg-white border border-emerald-100 rounded-2xl shadow-xs">
        <div class="flex items-center space-x-3">
          <div class="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-sm">
            ${idx + 1}
          </div>
          <div>
            <strong class="text-slate-900 text-sm sm:text-base">${escapeHtml(med.name)}</strong>
            <div class="mt-1">${timingBadge}</div>
          </div>
        </div>
        <button type="button" onclick="removeMedication(${idx})" class="text-slate-300 hover:text-rose-500 p-2 transition">
          <i class="fa-solid fa-trash-can text-sm"></i>
        </button>
      </div>
    `;
  }).join('');
}

function removeMedication(idx) {
  state.medications.splice(idx, 1);
  renderAddedMedsList();
}

// -------------------------------------------------------------------
// 5. 샘플 프리셋 로드
// -------------------------------------------------------------------
function loadSamplePreset(presetType) {
  resetForm();

  if (presetType === 'allergy') {
    // 졸림 주의 알레르기 비염약 + 공복 위장약
    document.getElementById('patient-name').value = '이영희';
    document.querySelector('input[name="gender"][value="F"]').checked = true;
    document.getElementById('patient-age').value = 42;
    document.getElementById('patient-weight').value = 54;

    ['천식/알레르기 비염', '만성 위염/역류성 식도염'].forEach(c => state.selectedConditions.add(c));
    highlightSelectedChips();

    state.medications = [
      { name: '레보세티리진', frequency: '자동추천', timings: [], isAutoScheduled: true },
      { name: '오메프라졸', frequency: '자동추천', timings: [], isAutoScheduled: true }
    ];
  } else if (presetType === 'hypertension_multi') {
    // 고혈압 + 1일 3회 소염진통제
    document.getElementById('patient-name').value = '김철수';
    document.querySelector('input[name="gender"][value="M"]').checked = true;
    document.getElementById('patient-age').value = 58;
    document.getElementById('patient-weight').value = 74;

    ['고혈압', '고지혈증'].forEach(c => state.selectedConditions.add(c));
    highlightSelectedChips();

    state.medications = [
      { name: '암로디핀', frequency: '자동추천', timings: [], isAutoScheduled: true },
      { name: '이부프로펜', frequency: '1일 3회', timings: ['morning_after', 'lunch_after', 'evening_after'], isAutoScheduled: false },
      { name: '아토르바스타틴', frequency: '자동추천', timings: [], isAutoScheduled: true }
    ];
  }

  renderAddedMedsList();
  window.scrollTo({ top: 320, behavior: 'smooth' });
}

function highlightSelectedChips() {
  const chips = document.querySelectorAll('.disease-chip');
  chips.forEach(chip => {
    if (state.selectedConditions.has(chip.textContent.trim())) {
      chip.classList.add('bg-emerald-50', 'border-emerald-500', 'text-emerald-700', 'font-bold');
    }
  });
}

// -------------------------------------------------------------------
// 6. 복약지도 생성 폼 제출
// -------------------------------------------------------------------
async function handleFormSubmit(e) {
  e.preventDefault();

  const name = document.getElementById('patient-name').value.trim();
  const gender = document.querySelector('input[name="gender"]:checked').value;
  const age = document.getElementById('patient-age').value;
  const weight = document.getElementById('patient-weight').value;

  if (state.medications.length === 0) {
    alert('최소 1가지 이상의 복용 약물을 등록해 주세요.');
    document.getElementById('med-search-input').focus();
    return;
  }

  const payload = {
    patientName: name,
    gender,
    age: parseInt(age, 10),
    weight: parseFloat(weight),
    conditions: Array.from(state.selectedConditions),
    medications: state.medications
  };

  const btnSubmit = document.getElementById('btn-submit-guidance');
  const originalBtnText = btnSubmit.innerHTML;
  btnSubmit.disabled = true;
  btnSubmit.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1.5"></i> 환자 맞춤 분석 및 스케줄링 중...`;

  try {
    const token = localStorage.getItem('knup_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch('/api/guidance', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error('서버 분석 실패');
    const result = await res.json();

    renderGuidanceResult(result);

    // 본인 이력 배지 갱신
    if (token) {
      fetch('/api/history', { headers: { 'Authorization': `Bearer ${token}` } })
        .then(r => r.json())
        .then(list => updateHistoryBadge(list.length))
        .catch(() => {});
    }

  } catch (err) {
    alert('복약지도 생성 오류: ' + err.message);
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.innerHTML = originalBtnText;
  }
}

// -------------------------------------------------------------------
// 7. 결과 리포트 화면 렌더링 (대형 주의사항 전면 배치)
// -------------------------------------------------------------------
function renderGuidanceResult(data) {
  state.currentRecord = data;

  document.getElementById('input-section').classList.add('hidden');
  document.getElementById('intro-banner').classList.add('hidden');
  const resSection = document.getElementById('result-section');
  resSection.classList.remove('hidden');

  const printDateEl = document.getElementById('print-date');
  if (printDateEl) {
    printDateEl.textContent = new Date().toLocaleDateString('ko-KR', {
      year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }

  // 🚨 [핵심] 대형 주의사항 (졸림, 운전금지, 음주금기 등) 최상단 렌더링
  renderCriticalWarningsBanner(data.criticalWarnings || []);

  // [A] 환자 정보 요약
  document.getElementById('res-patient-name').textContent = data.patientName;
  document.getElementById('res-patient-meta').textContent = 
    `${data.gender} · 만 ${data.age}세 · ${data.weight}kg (BMI: ${data.exercisePlan?.bmi ? data.exercisePlan.bmi.split(' ')[0] : '정상'})`;

  const condContainer = document.getElementById('res-patient-conditions');
  if (data.conditions && data.conditions.length > 0) {
    condContainer.innerHTML = data.conditions.map(c => 
      `<span class="text-xs px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold">${escapeHtml(c)}</span>`
    ).join('');
  } else {
    condContainer.innerHTML = `<span class="text-xs text-slate-400">등록된 기저질환 없음</span>`;
  }

  // 종합 안전도
  const scoreEl = document.getElementById('res-safety-score');
  const iconEl = document.getElementById('res-safety-icon');
  scoreEl.textContent = data.safetyScore;
  if (data.safetyScore === '안전') {
    scoreEl.className = 'text-base font-bold text-emerald-700';
    iconEl.className = 'w-9 h-9 rounded-full flex items-center justify-center text-white text-base bg-emerald-500';
    iconEl.innerHTML = `<i class="fa-solid fa-check"></i>`;
  } else if (data.safetyScore === '주의/위험') {
    scoreEl.className = 'text-base font-bold text-rose-600';
    iconEl.className = 'w-9 h-9 rounded-full flex items-center justify-center text-white text-base bg-rose-500 animate-pulse';
    iconEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i>`;
  } else {
    scoreEl.className = 'text-base font-bold text-amber-600';
    iconEl.className = 'w-9 h-9 rounded-full flex items-center justify-center text-white text-base bg-amber-500';
    iconEl.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i>`;
  }

  // [B] 하루 다회 복용 반영 데일리 체크리스트
  renderDailyChecklist(data.timeline);

  // [C] 시간대별 타임라인
  renderTimeline(data.timeline);

  // [D] DDI 경고
  renderDdiWarnings(data.ddiWarnings);

  // [E] 금기 음식/음료
  renderFoodWarnings(data.foodWarnings);

  // [F] 영양제 궁합
  renderSupplements(data.supplements);

  // [G] 맞춤 식단 및 운동
  renderDietPlans(data.dietPlans);
  renderExercisePlan(data.exercisePlan);

  // [H] 약학정보원 스타일 보관법 및 부작용 대처
  renderStorageAndSideEffects(data.medications);

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// 🚨 [대형 주의사항 전용 하이라이트 배너 - rule_2.md 규격]
function renderCriticalWarningsBanner(warnings) {
  const container = document.getElementById('critical-warnings-banner-container');
  if (!warnings || warnings.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = warnings.map(w => {
    let cardClass = 'critical-alert-card critical-alert-drowsiness';
    if (w.severity === 'danger') {
      cardClass = 'critical-alert-card critical-alert-danger';
    } else if (w.type === 'no_lying_down' || w.type === 'empty_stomach') {
      cardClass = 'critical-alert-card critical-alert-info';
    }

    return `
      <div class="${cardClass}">
        <div class="flex items-start gap-4">
          <div class="text-3xl sm:text-4xl shrink-0 mt-0.5">
            <i class="fa-solid ${w.icon || 'fa-triangle-exclamation'}"></i>
          </div>
          <div class="flex-1">
            <div class="flex flex-wrap items-center gap-2 mb-1">
              <span class="text-xs font-extrabold px-3 py-1 rounded-full bg-white/90 border border-current shadow-xs tracking-wide">
                ${escapeHtml(w.badge)}
              </span>
              <span class="text-xs font-bold opacity-80">[관련 약물: ${escapeHtml(w.drugName)}]</span>
            </div>
            <h3 class="critical-alert-title mb-1.5 mt-0.5">
              ${escapeHtml(w.title)}
            </h3>
            <p class="text-xs sm:text-sm font-semibold opacity-90 leading-relaxed">
              ${escapeHtml(w.detail)}
            </p>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// [B] 오늘의 복약 체크리스트 (하루 다회 복용 반영)
function renderDailyChecklist(timeline) {
  const container = document.getElementById('daily-checklist-container');
  container.innerHTML = '';
  state.dailyCheckStatus = {};

  let totalItems = 0;

  timeline.forEach(slot => {
    slot.items.forEach((med, idx) => {
      totalItems++;
      const itemKey = `${slot.key}_${med.name}_${idx}`;
      state.dailyCheckStatus[itemKey] = false;

      const card = document.createElement('div');
      card.className = 'p-3.5 bg-white border border-emerald-100 rounded-2xl flex items-center justify-between hover:bg-emerald-50/50 transition cursor-pointer shadow-xs';
      card.onclick = () => toggleCheckItem(itemKey, card);

      card.innerHTML = `
        <div class="flex items-center space-x-2.5 overflow-hidden">
          <div id="check-icon-${itemKey}" class="w-6 h-6 rounded-lg border-2 border-slate-300 flex items-center justify-center text-white text-xs transition">
            <i class="fa-solid fa-check hidden"></i>
          </div>
          <div class="truncate">
            <strong class="text-xs sm:text-sm text-slate-900 block truncate" id="check-text-${itemKey}">${escapeHtml(med.name)}</strong>
            <span class="text-[11px] text-emerald-700 font-semibold">${slot.title.split(' ')[0]} ${slot.time}</span>
          </div>
        </div>
      `;
      container.appendChild(card);
    });
  });

  updateAdherenceProgress();
}

function toggleCheckItem(itemKey, cardEl) {
  state.dailyCheckStatus[itemKey] = !state.dailyCheckStatus[itemKey];
  const isChecked = state.dailyCheckStatus[itemKey];

  const iconEl = document.getElementById(`check-icon-${itemKey}`);
  const textEl = document.getElementById(`check-text-${itemKey}`);

  if (isChecked) {
    iconEl.classList.remove('border-slate-300');
    iconEl.classList.add('bg-emerald-600', 'border-emerald-600');
    iconEl.querySelector('i').classList.remove('hidden');
    textEl.classList.add('med-checked-text');
    cardEl.classList.add('bg-emerald-50/80', 'border-emerald-300');
  } else {
    iconEl.classList.remove('bg-emerald-600', 'border-emerald-600');
    iconEl.classList.add('border-slate-300');
    iconEl.querySelector('i').classList.add('hidden');
    textEl.classList.remove('med-checked-text');
    cardEl.classList.remove('bg-emerald-50/80', 'border-emerald-300');
  }

  updateAdherenceProgress();
}

function updateAdherenceProgress() {
  const keys = Object.keys(state.dailyCheckStatus);
  if (keys.length === 0) return;

  const checkedCount = keys.filter(k => state.dailyCheckStatus[k]).length;
  const percent = Math.round((checkedCount / keys.length) * 100);

  document.getElementById('adherence-percent').textContent = `${percent}%`;
  document.getElementById('adherence-bar').style.width = `${percent}%`;
}

// [C] 시간대별 타임라인
function renderTimeline(timeline) {
  const container = document.getElementById('timeline-container');
  container.innerHTML = '';

  timeline.forEach(slot => {
    if (!slot.items || slot.items.length === 0) return;

    const slotCard = document.createElement('div');
    slotCard.className = 'border border-emerald-100 rounded-2xl p-4 sm:p-5 bg-white shadow-xs';

    const medsHtml = slot.items.map(med => {
      const tipsHtml = (med.administrationTips || []).map(tip => 
        `<li class="text-xs text-slate-600 flex items-start gap-1.5 mt-0.5"><i class="fa-solid fa-circle-check text-emerald-600 text-[10px] mt-1 shrink-0"></i><span>${escapeHtml(tip)}</span></li>`
      ).join('');

      let autoScheduleNotice = '';
      if (med.isAutoScheduled && med.scheduleReason) {
        autoScheduleNotice = `<div class="text-[11px] text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100 mt-2 font-medium flex items-center gap-1.5"><i class="fa-solid fa-wand-magic-sparkles text-emerald-600"></i> ${escapeHtml(med.scheduleReason)}</div>`;
      }

      return `
        <div class="bg-[#F6FBF7] p-4 rounded-xl border border-emerald-100 mb-3 last:mb-0">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-100/70 pb-2.5 mb-2.5">
            <div>
              <div class="flex items-center gap-2">
                <span class="font-bold text-slate-900 text-sm sm:text-base">${escapeHtml(med.name)}</span>
                <span class="text-xs px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold">${escapeHtml(med.category)}</span>
                <span class="text-xs text-slate-500 font-semibold">[${escapeHtml(med.frequency)}]</span>
              </div>
              <p class="text-xs text-slate-500 mt-0.5">${escapeHtml(med.efficacy)}</p>
            </div>
            <div class="text-right sm:self-center">
              <span class="inline-block text-xs font-bold text-emerald-900 bg-emerald-200/60 px-3 py-1 rounded-lg">
                ${escapeHtml(med.dosage)}
              </span>
            </div>
          </div>
          ${tipsHtml ? `<ul class="space-y-1">${tipsHtml}</ul>` : ''}
          ${autoScheduleNotice}
        </div>
      `;
    }).join('');

    slotCard.innerHTML = `
      <div class="flex items-center justify-between mb-3 border-b border-emerald-50 pb-2">
        <div class="flex items-center space-x-2">
          <span class="text-xl">${slot.icon}</span>
          <h4 class="font-bold text-slate-900 text-sm sm:text-base">${slot.title}</h4>
        </div>
        <span class="text-xs font-bold px-2.5 py-1 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800">
          <i class="fa-regular fa-clock mr-1 text-emerald-600"></i>권장 시간: ${slot.time}
        </span>
      </div>
      <div class="space-y-2">
        ${medsHtml}
      </div>
    `;

    container.appendChild(slotCard);
  });
}

// [D] DDI 경고
function renderDdiWarnings(warnings) {
  const container = document.getElementById('ddi-warnings-container');
  if (!warnings || warnings.length === 0) {
    container.innerHTML = `
      <div class="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs sm:text-sm text-emerald-900 flex items-center gap-2.5 font-medium">
        <i class="fa-solid fa-circle-check text-emerald-600 text-base"></i>
        <span>현재 등록된 약물 간의 심각한 병용 금기나 중복 처방 위험이 없습니다.</span>
      </div>
    `;
    return;
  }

  container.innerHTML = warnings.map(w => {
    const isDanger = w.severity === 'danger';
    return `
      <div class="p-4 rounded-2xl border ${isDanger ? 'border-rose-200 bg-rose-50/60' : 'border-amber-200 bg-amber-50/60'}">
        <div class="flex items-center gap-2 mb-1.5">
          <span class="text-xs font-extrabold px-2.5 py-0.5 rounded-full ${isDanger ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}">
            ${isDanger ? '🚨 위험 / 병용 금기' : '⚠️ 주의 / 확인 필요'}
          </span>
          <strong class="text-sm font-bold text-slate-900">${escapeHtml(w.title)}</strong>
        </div>
        <p class="text-xs text-slate-700 leading-relaxed mb-2">${escapeHtml(w.description)}</p>
        <div class="p-2.5 bg-white/90 rounded-xl border border-slate-200 text-xs text-slate-800 flex items-start gap-1.5 font-medium">
          <i class="fa-solid fa-hand-holding-medical text-emerald-600 text-sm shrink-0 mt-0.5"></i>
          <span><strong>권장 조치:</strong> ${escapeHtml(w.action)}</span>
        </div>
      </div>
    `;
  }).join('');
}

// [E] 음식 경고
function renderFoodWarnings(warnings) {
  const container = document.getElementById('food-warnings-container');
  if (!warnings || warnings.length === 0) {
    container.innerHTML = `<div class="p-4 text-xs text-slate-500 col-span-2">특별한 음식 금기 사항이 없습니다.</div>`;
    return;
  }

  container.innerHTML = warnings.map(w => `
    <div class="p-3.5 bg-rose-50/40 border border-rose-200 rounded-2xl">
      <div class="flex items-center justify-between mb-1.5">
        <strong class="text-xs sm:text-sm font-bold text-rose-800 flex items-center gap-1.5">
          <i class="fa-solid fa-circle-exclamation text-rose-500"></i>
          ${escapeHtml(w.food)}
        </strong>
        <span class="text-[11px] text-slate-500 font-medium">${w.relatedDrugs.map(d => escapeHtml(d)).join(', ')}</span>
      </div>
      <p class="text-xs text-slate-600 leading-relaxed">${escapeHtml(w.reason)}</p>
    </div>
  `).join('');
}

// [F] 영양제 팁
function renderSupplements(supplements) {
  const container = document.getElementById('supplements-container');
  if (!supplements || supplements.length === 0) {
    container.innerHTML = `<div class="p-3 text-xs text-slate-500">등록된 약물에 대한 특별한 영양제 병용 팁이 없습니다.</div>`;
    return;
  }

  container.innerHTML = supplements.map(s => `
    <div class="p-3 bg-emerald-50/60 border border-emerald-200 rounded-xl flex items-start gap-3">
      <div class="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs shrink-0 font-bold mt-0.5">
        <i class="fa-solid fa-capsules"></i>
      </div>
      <div>
        <span class="text-xs font-bold text-emerald-900 block mb-0.5">${escapeHtml(s.drug)} 복용 시 추천:</span>
        <p class="text-xs text-slate-700">${escapeHtml(s.tip)}</p>
      </div>
    </div>
  `).join('');
}

// [G] 맞춤 식단 및 운동
function renderDietPlans(dietPlans) {
  const container = document.getElementById('diet-plans-container');
  container.innerHTML = dietPlans.map(dp => `
    <div class="p-4 bg-[#F6FBF7] border border-emerald-100 rounded-2xl">
      <div class="flex items-center justify-between mb-2 pb-1.5 border-b border-emerald-100">
        <strong class="text-xs sm:text-sm font-bold text-emerald-900">[${escapeHtml(dp.condition)}] 식단</strong>
        <span class="text-[11px] text-slate-500"><i class="fa-solid fa-droplet text-sky-500 mr-1"></i>${escapeHtml(dp.waterIntake)}</span>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs mb-2.5">
        <div class="bg-emerald-50/80 p-2.5 rounded-xl border border-emerald-100">
          <span class="font-bold text-emerald-900 block mb-1">👍 추천하는 식품:</span>
          <ul class="space-y-0.5 text-slate-700">
            ${dp.recommend.map(r => `<li>• ${escapeHtml(r)}</li>`).join('')}
          </ul>
        </div>
        <div class="bg-rose-50/80 p-2.5 rounded-xl border border-rose-100">
          <span class="font-bold text-rose-800 block mb-1">👎 피해야 할 식품:</span>
          <ul class="space-y-0.5 text-slate-700">
            ${dp.avoid.map(a => `<li>• ${escapeHtml(a)}</li>`).join('')}
          </ul>
        </div>
      </div>
      <div class="p-2 bg-white rounded-lg border border-slate-200 text-xs text-slate-600">
        <strong>💡 핵심 식습관:</strong> ${escapeHtml(dp.keyTip)}
      </div>
    </div>
  `).join('');
}

function renderExercisePlan(ex) {
  const container = document.getElementById('exercise-plan-container');
  if (!ex) return;

  const medWarningsHtml = (ex.medWarnings || []).map(w => 
    `<div class="p-2.5 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 mt-2">
      <strong>⚠️ [${escapeHtml(w.category)}] 운동 안전 수칙:</strong> ${escapeHtml(w.warning)}
    </div>`
  ).join('');

  container.innerHTML = `
    <div class="p-4 bg-[#F6FBF7] border border-emerald-100 rounded-2xl space-y-3">
      <div class="flex items-center justify-between border-b border-emerald-100 pb-2">
        <strong class="text-xs sm:text-sm font-bold text-emerald-900">${escapeHtml(ex.ageGroup)} 운동 가이드</strong>
        <span class="text-xs px-2 py-0.5 bg-white rounded-md border border-slate-200 text-slate-600 font-medium">강도: ${escapeHtml(ex.intensity)}</span>
      </div>
      <div class="text-xs space-y-1">
        <span class="font-bold text-slate-800 block">권장 운동 루틴:</span>
        <ul class="space-y-1 text-slate-700">
          ${(ex.recommend || []).map(r => `<li>• ${escapeHtml(r)}</li>`).join('')}
        </ul>
      </div>
      <div class="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900">
        <strong>💡 운동 안전 팁:</strong> ${escapeHtml(ex.ageTip)}
      </div>
      ${medWarningsHtml}
    </div>
  `;
}

// [H] 보관법 및 부작용
function renderStorageAndSideEffects(meds) {
  const container = document.getElementById('storage-sideeffects-container');
  container.innerHTML = meds.map(med => `
    <div class="p-4 bg-[#F6FBF7] border border-emerald-100 rounded-2xl text-xs space-y-2">
      <div class="flex items-center justify-between border-b border-emerald-100 pb-1.5">
        <strong class="font-bold text-slate-900 text-sm">${escapeHtml(med.name)}</strong>
        <span class="text-[11px] text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded font-bold">${escapeHtml(med.category)}</span>
      </div>
      <div>
        <span class="font-semibold text-slate-700 block mb-0.5"><i class="fa-solid fa-box text-slate-400 mr-1"></i>보관 방법:</span>
        <p class="text-slate-600">${escapeHtml(med.storage || '실온 건조한 곳에 보관')}</p>
      </div>
      <div>
        <span class="font-semibold text-rose-700 block mb-0.5"><i class="fa-solid fa-head-side-cough text-rose-400 mr-1"></i>주요 이상 반응 및 대처:</span>
        <p class="text-slate-600">${escapeHtml(med.sideEffects || '이상 반응 발생 시 담당 의료진과 상담하세요.')}</p>
      </div>
    </div>
  `).join('');
}

// -------------------------------------------------------------------
// 8. 폼 복원 및 리셋
// -------------------------------------------------------------------
function fillFormWithData(record) {
  resetForm();

  document.getElementById('patient-name').value = record.patientName || '';
  if (record.gender === '남성' || record.gender === 'M') {
    document.querySelector('input[name="gender"][value="M"]').checked = true;
  } else {
    document.querySelector('input[name="gender"][value="F"]').checked = true;
  }
  document.getElementById('patient-age').value = record.age || '';
  document.getElementById('patient-weight').value = record.weight || '';

  (record.conditions || []).forEach(cond => {
    state.selectedConditions.add(cond);
  });
  highlightSelectedChips();

  state.medications = (record.medications || []).map(m => ({
    name: m.name,
    frequency: m.frequency || '1일 1회',
    timings: m.timings || ['morning_after'],
    isAutoScheduled: m.isAutoScheduled || false
  }));

  renderAddedMedsList();

  document.getElementById('input-section').classList.remove('hidden');
  document.getElementById('intro-banner').classList.remove('hidden');
  document.getElementById('result-section').classList.add('hidden');
  window.scrollTo({ top: 100, behavior: 'smooth' });
}

function editCurrentProfile() {
  if (state.currentRecord) {
    fillFormWithData(state.currentRecord);
  }
}

function resetForm() {
  document.getElementById('medication-form').reset();
  state.selectedConditions.clear();
  state.medications = [];

  const chips = document.querySelectorAll('.disease-chip');
  chips.forEach(chip => {
    chip.classList.remove('bg-emerald-50', 'border-emerald-500', 'text-emerald-700', 'font-bold');
    chip.classList.add('border-slate-200');
  });

  renderAddedMedsList();
}

function resetToNewForm() {
  resetForm();
  document.getElementById('input-section').classList.remove('hidden');
  document.getElementById('intro-banner').classList.remove('hidden');
  document.getElementById('result-section').classList.add('hidden');
  scrollToTop();
}

// 전역 바인딩
window.renderGuidanceResult = renderGuidanceResult;
window.fillFormWithData = fillFormWithData;
window.editCurrentProfile = editCurrentProfile;
window.resetToNewForm = resetToNewForm;
window.resetForm = resetForm;
window.quickAddMed = quickAddMed;
window.removeMedication = removeMedication;
window.loadSamplePreset = loadSamplePreset;
window.toggleDiseaseChip = toggleDiseaseChip;
window.addCustomCondition = addCustomCondition;
window.handleAddMedication = handleAddMedication;
window.selectAutocompleteItem = selectAutocompleteItem;
window.toggleAutoScheduleMode = toggleAutoScheduleMode;
window.selectFrequency = selectFrequency;
window.openAuthModal = openAuthModal;
window.closeAuthModal = closeAuthModal;
window.switchAuthTab = switchAuthTab;
window.handleLoginSubmit = handleLoginSubmit;
window.handleRegisterSubmit = handleRegisterSubmit;
window.handleLogout = handleLogout;
window.quickLoginDemo = quickLoginDemo;
