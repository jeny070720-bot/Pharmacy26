/**
 * KNUP 복약지도 v2.0 - 환자 본인 전용 이력 관리 모듈 (history.js)
 */

function getAuthHeaders() {
  const token = localStorage.getItem('knup_token');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

function openHistoryModal() {
  const modal = document.getElementById('history-modal');
  if (modal) {
    modal.classList.remove('hidden');
    loadHistoryList();
  }
}

function closeHistoryModal() {
  const modal = document.getElementById('history-modal');
  if (modal) {
    modal.classList.add('hidden');
  }
}

// 환자 본인의 이력 목록 불러오기
async function loadHistoryList() {
  const container = document.getElementById('history-list-container');
  if (!container) return;

  container.innerHTML = `
    <div class="py-12 text-center text-slate-400">
      <i class="fa-solid fa-spinner fa-spin text-2xl text-emerald-600 mb-2"></i>
      <p class="text-sm">본인의 복약 기록을 불러오는 중입니다...</p>
    </div>
  `;

  try {
    const res = await fetch('/api/history', {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('이력 조회 실패');
    const records = await res.json();

    updateHistoryBadge(records.length);

    if (!records || records.length === 0) {
      container.innerHTML = `
        <div class="py-12 text-center text-slate-400">
          <i class="fa-solid fa-folder-open text-3xl mb-2 text-slate-300"></i>
          <p class="text-sm">보관된 본인의 복약지도 기록이 없습니다.</p>
          <p class="text-xs text-slate-400 mt-1">새 복약지도를 작성하면 내 계정에 안전하게 저장됩니다.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = records.map(record => {
      const dateStr = new Date(record.createdAt).toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      const conditionsHtml = (record.conditions || []).map(c => 
        `<span class="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md">${escapeHtml(c)}</span>`
      ).join(' ');

      const medCount = (record.medications || []).length;
      const safetyColor = record.safetyScore === '안전' 
        ? 'text-emerald-700 bg-emerald-50 border-emerald-200' 
        : (record.safetyScore === '주의/위험' ? 'text-rose-700 bg-rose-50 border-rose-200' : 'text-amber-700 bg-amber-50 border-amber-200');

      return `
        <div class="p-4 bg-white border border-emerald-100 hover:border-emerald-500 rounded-2xl transition shadow-xs hover:shadow-md">
          <div class="flex items-start justify-between gap-3 mb-2">
            <div>
              <div class="flex items-center gap-2">
                <strong class="text-slate-900 font-bold text-sm sm:text-base">${escapeHtml(record.patientName)}</strong>
                <span class="text-xs text-slate-500">(${record.gender} · 만 ${record.age}세 · ${record.weight}kg)</span>
                <span class="text-xs px-2 py-0.5 rounded-full border font-bold ${safetyColor}">${record.safetyScore}</span>
              </div>
              <span class="text-xs text-slate-400 mt-0.5 block">${dateStr}</span>
            </div>
            <div class="flex items-center gap-1.5">
              <button onclick="viewHistoryDetail('${record.id}')" class="px-3 py-1 bg-emerald-50 hover:bg-emerald-600 hover:text-white text-emerald-800 text-xs font-bold rounded-xl transition border border-emerald-200">
                열람하기
              </button>
              <button onclick="restoreRecordToForm('${record.id}')" class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition" title="이 데이터로 폼 채우기">
                불러오기
              </button>
              <button onclick="deleteHistoryRecord('${record.id}')" class="p-1.5 text-slate-300 hover:text-rose-500 rounded-lg transition" title="기록 삭제">
                <i class="fa-solid fa-trash-can text-xs"></i>
              </button>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-1.5 mt-2 pt-2 border-t border-slate-100">
            <span class="text-xs text-slate-500 font-medium mr-1">약물 ${medCount}종:</span>
            ${(record.medications || []).slice(0, 4).map(m => `<span class="text-xs px-2 py-0.5 bg-emerald-50 text-emerald-800 rounded-md font-semibold">${escapeHtml(m.name)}</span>`).join('')}
            ${medCount > 4 ? `<span class="text-xs text-slate-400 font-medium">+${medCount - 4}개</span>` : ''}
          </div>
          ${conditionsHtml ? `<div class="mt-2 flex flex-wrap gap-1">${conditionsHtml}</div>` : ''}
        </div>
      `;
    }).join('');

  } catch (err) {
    console.error('History load error:', err);
    container.innerHTML = `
      <div class="py-8 text-center text-rose-500 text-sm">
        이력을 불러오는 중 오류가 발생했습니다: ${err.message}
      </div>
    `;
  }
}

function updateHistoryBadge(count) {
  const badge = document.getElementById('history-badge');
  if (badge) {
    if (count > 0) {
      badge.textContent = count;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }
}

// 이력 상세 바로 열람
async function viewHistoryDetail(id) {
  try {
    const res = await fetch(`/api/history/${id}`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('상세 조회 실패');
    const record = await res.json();

    closeHistoryModal();
    if (typeof window.renderGuidanceResult === 'function') {
      window.renderGuidanceResult(record);
      window.currentRecord = record;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  } catch (err) {
    alert('기록을 불러오지 못했습니다: ' + err.message);
  }
}

// 이력 데이터로 입력 폼 채우기 (수정 모드)
async function restoreRecordToForm(id) {
  try {
    const res = await fetch(`/api/history/${id}`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('상세 조회 실패');
    const record = await res.json();

    closeHistoryModal();
    if (typeof window.fillFormWithData === 'function') {
      window.fillFormWithData(record);
    }
  } catch (err) {
    alert('기록 복원 실패: ' + err.message);
  }
}

// 이력 삭제
async function deleteHistoryRecord(id) {
  if (!confirm('이 복약지도 기록을 삭제하시겠습니까? (삭제된 본인의 기록은 복구할 수 없습니다)')) return;

  try {
    const res = await fetch(`/api/history/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('삭제 실패');
    loadHistoryList();
  } catch (err) {
    alert('삭제 오류: ' + err.message);
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
