const fs = require('fs');
const path = require('path');

const historyFilePath = path.join(__dirname, '..', 'data', 'history.json');

function loadHistory() {
  try {
    if (!fs.existsSync(historyFilePath)) {
      // 데모 환자용 초기 이력 데이터
      const initialData = [
        {
          id: "rec_demo_101",
          userId: "usr_patient01", // 김철수 환자 전용 기록
          patientName: "김철수",
          gender: "남성",
          age: 58,
          weight: 74,
          conditions: ["고혈압", "고지혈증"],
          medications: [
            {
              name: "암로디핀",
              category: "혈압강하제 (칼슘채널차단제)",
              frequency: "1일 1회",
              timings: ["morning_after"],
              dosage: "1일 1회 5mg",
              administrationTips: ["매일 일정한 시간(주로 아침)에 복용하세요."]
            },
            {
              name: "아토르바스타틴",
              category: "이상지질혈증(고지혈증) 치료제 (스타틴계)",
              frequency: "1일 1회",
              timings: ["evening_after"],
              dosage: "1일 1회 20mg",
              administrationTips: ["콜레스테롤 합성이 활발한 저녁 시간대 복용 시 효과가 극대화됩니다."]
            }
          ],
          criticalWarnings: [
            {
              type: "grapefruit",
              severity: "danger",
              icon: "fa-ban",
              badge: "🚨 자몽 및 자몽주스 절대 섭취 금지",
              title: "자몽 성분이 약물 농도를 폭증시켜 근육 괴사를 부릅니다!",
              detail: "스타틴 및 혈압약 대사를 방해하여 심각한 근육 손상(횡문근융해증)을 유발합니다.",
              relatedDrugs: ["아토르바스타틴", "암로디핀"]
            },
            {
              type: "dizziness",
              severity: "high",
              icon: "fa-person-falling",
              badge: "⚠️ 기립성 저혈압 및 어지러움 주의",
              title: "앉거나 누웠다 일어날 때 천천히 일어나세요!",
              detail: "혈관 확장 작용으로 일시적 어지럼증과 낙상 위험이 있습니다.",
              relatedDrugs: ["암로디핀"]
            }
          ],
          safetyScore: "안전",
          timeline: [
            {
              key: "morning_after",
              title: "아침 식후 (식사 30분 후)",
              icon: "🥣",
              time: "08:30",
              items: [
                {
                  name: "암로디핀",
                  dosage: "1일 1회 5mg",
                  category: "혈압강하제",
                  administrationTips: ["매일 일정한 시간에 복용하세요."]
                }
              ]
            },
            {
              key: "evening_after",
              title: "저녁 식후 (식사 30분 후)",
              icon: "🌙",
              time: "19:00",
              items: [
                {
                  name: "아토르바스타틴",
                  dosage: "1일 1회 20mg",
                  category: "이상지질혈증치료제",
                  administrationTips: ["저녁 식후 복용 권장"]
                }
              ]
            }
          ],
          ddiWarnings: [],
          foodWarnings: [
            {
              food: "자몽 및 자몽주스",
              severity: "danger",
              reason: "스타틴 및 혈압약 대사를 억제하여 체내 농도를 위험할 정도로 높입니다.",
              relatedDrugs: ["아토르바스타틴", "암로디핀"]
            }
          ],
          dietPlans: [
            {
              condition: "고혈압",
              recommend: ["저염식 DASH 식단", "토마토, 오이", "등푸른 생선"],
              avoid: ["짠 국물", "젓갈", "라면"],
              waterIntake: "하루 1.5~2L 미온수",
              keyTip: "국물 섭취를 줄이고 건더기 위주로 식사하세요."
            }
          ],
          exercisePlan: {
            ageGroup: "중장년층 (50~60대)",
            recommend: ["빠르게 걷기 40분 주 4회", "실내 자전거"],
            intensity: "옆 사람과 대화 가능한 중등도",
            ageTip: "혈압약 복용 후 기립성 저혈압에 유의하세요.",
            bmi: "25.0 (과체중 경향)",
            medWarnings: []
          },
          createdAt: new Date(Date.now() - 86400000 * 2).toISOString()
        }
      ];
      fs.writeFileSync(historyFilePath, JSON.stringify(initialData, null, 2), 'utf8');
      return initialData;
    }
    const data = fs.readFileSync(historyFilePath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('[Storage Error] Failed to read history:', err);
    return [];
  }
}

function saveHistory(list) {
  try {
    fs.writeFileSync(historyFilePath, JSON.stringify(list, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('[Storage Error] Failed to write history:', err);
    return false;
  }
}

// 특정 환자(userId)의 기록만 필터링하여 조회 (환자 개인정보 보호)
function getAllRecords(userId) {
  const list = loadHistory();
  if (!userId) return [];
  return list
    .filter(r => r.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// 특정 기록 상세 조회 (본인 기록 검증)
function getRecordById(id, userId) {
  const list = loadHistory();
  const record = list.find(r => r.id === id);
  if (!record) return null;
  // 본인 기록이 아니면 접근 차단
  if (userId && record.userId && record.userId !== userId) {
    return null;
  }
  return record;
}

// 신규 레코드 추가 (userId 바인딩)
function addRecord(record, userId) {
  const list = loadHistory();
  const newRecord = {
    id: `rec_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    userId: userId || "guest",
    ...record
  };
  list.unshift(newRecord);
  saveHistory(list);
  return newRecord;
}

// 레코드 삭제 (본인 기록 검증)
function deleteRecord(id, userId) {
  const list = loadHistory();
  const target = list.find(r => r.id === id);
  if (!target) return false;
  if (userId && target.userId && target.userId !== userId) {
    return false; // 권한 없음
  }

  const nextList = list.filter(r => r.id !== id);
  saveHistory(nextList);
  return true;
}

module.exports = {
  getAllRecords,
  getRecordById,
  addRecord,
  deleteRecord
};
