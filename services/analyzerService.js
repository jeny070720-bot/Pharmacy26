const fs = require('fs');
const path = require('path');

// 지식 베이스 로드
const kbPath = path.join(__dirname, '..', 'data', 'knowledge_base.json');
let knowledgeBase = { drugs: [], ddiRules: [], diseaseDiet: {}, exerciseGuide: {} };

try {
  const rawData = fs.readFileSync(kbPath, 'utf8');
  knowledgeBase = JSON.parse(rawData);
} catch (err) {
  console.error('[Error] Knowledge base load failed:', err.message);
}

/**
 * 약물명 정규화 및 검색
 */
function findDrugInfo(inputName) {
  if (!inputName || typeof inputName !== 'string') return null;
  const cleanName = inputName.trim().toLowerCase();

  // 1. 직접 매칭
  let match = knowledgeBase.drugs.find(d => 
    d.name.toLowerCase() === cleanName || 
    (d.aliases && d.aliases.some(a => a.toLowerCase() === cleanName))
  );

  if (match) return match;

  // 2. 부분 일치 검색
  match = knowledgeBase.drugs.find(d => 
    d.name.toLowerCase().includes(cleanName) || 
    cleanName.includes(d.name.toLowerCase()) ||
    (d.aliases && d.aliases.some(a => a.toLowerCase().includes(cleanName) || cleanName.includes(a.toLowerCase())))
  );

  return match || null;
}

/**
 * 스마트 자동 복약시간 추론 함수 (Auto-Scheduler)
 * 약 이름과 효능을 바탕으로 최적의 복약 시간대 배열과 횟수를 자동 배정
 */
function inferOptimalSchedule(drugInfo, customName = '') {
  if (drugInfo) {
    return {
      frequency: drugInfo.defaultFrequency || '1일 1회',
      timings: drugInfo.recommendedTimings || [drugInfo.defaultTiming || 'morning_after'],
      isAutoScheduled: true,
      reason: getAutoScheduleReason(drugInfo)
    };
  }

  // DB에 없는 약물의 경우 명칭 기반 키워드 휴리스틱
  const lowerName = customName.toLowerCase();
  if (lowerName.includes('알레르기') || lowerName.includes('비염') || lowerName.includes('수면') || lowerName.includes('진정')) {
    return {
      frequency: "1일 1회",
      timings: ["bedtime"],
      isAutoScheduled: true,
      reason: "졸음 유발 가능성이 높아 취침 전 복용으로 자동 추천되었습니다."
    };
  } else if (lowerName.includes('소염') || lowerName.includes('진통') || lowerName.includes('관절')) {
    return {
      frequency: "1일 3회",
      timings: ["morning_after", "lunch_after", "evening_after"],
      isAutoScheduled: true,
      reason: "위장 보호를 위해 식사 직후(아침/점심/저녁) 복용으로 자동 추천되었습니다."
    };
  } else if (lowerName.includes('위장') || lowerName.includes('소화')) {
    return {
      frequency: "1일 1회",
      timings: ["morning_before"],
      isAutoScheduled: true,
      reason: "위 점막 보호 및 약효 흡수를 위해 아침 식전 복용으로 자동 추천되었습니다."
    };
  }

  return {
    frequency: "1일 1회",
    timings: ["morning_after"],
    isAutoScheduled: true,
    reason: "규칙적인 아침 식후 복용으로 기본 추천되었습니다."
  };
}

function getAutoScheduleReason(drug) {
  if (drug.id === 'levocetirizine') return "졸음을 유발하므로 활동 시간을 피해 '취침 전' 복용으로 자동 지정되었습니다.";
  if (drug.id === 'omeprazole' || drug.id === 'alendronate') return "공복에 복용해야 약효가 온전히 흡수되므로 '아침 식전'으로 자동 지정되었습니다.";
  if (drug.id === 'atorvastatin') return "간에서 콜레스테롤 합성이 활발한 시간대에 맞춰 '저녁 식후'로 자동 지정되었습니다.";
  if (drug.id === 'ibuprofen' || drug.id === 'amoxicillin') return "약효의 지속적인 혈중 농도 유지 및 위장 장애 예방을 위해 '1일 3회(식후)'로 자동 지정되었습니다.";
  return "가장 안정적인 약물 흡수 리듬을 위해 추천 시간대로 자동 지정되었습니다.";
}

/**
 * 시간대별 분류 정의
 */
const TIMING_LABELS = {
  morning_before: { title: "아침 식전 (식사 30분 전)", icon: "🌅", time: "07:30" },
  morning_after: { title: "아침 식후 (식사 30분 후)", icon: "🥣", time: "08:30" },
  lunch_after: { title: "점심 식후 (식사 30분 후)", icon: "☀️", time: "13:00" },
  evening_after: { title: "저녁 식후 (식사 30분 후)", icon: "🌙", time: "19:00" },
  bedtime: { title: "취침 전 (잠들기 30분~1시간 전)", icon: "🛌", time: "22:30" }
};

/**
 * 메인 복약지도 분석 함수 v2.0
 */
function generateMedicationGuidance({ patientName, gender, age, weight, conditions = [], medications = [] }) {
  const ageNum = parseInt(age, 10) || 40;
  const weightNum = parseFloat(weight) || 60;

  // 1. 등록된 약물에 대한 상세 정보 매핑 및 하루 다회 복용/자동 스케줄링 처리
  const analyzedMeds = medications.map((med, idx) => {
    const medName = typeof med === 'string' ? med : (med.name || '');
    const matched = findDrugInfo(medName);

    // 자동 추천 요청 여부 확인
    const isAutoRequest = med.isAutoScheduled === true || med.timing === 'auto' || !med.timings || med.timings.length === 0;
    
    let resolvedTimings = [];
    let resolvedFreq = med.frequency || '1일 1회';
    let scheduleReason = '';

    if (isAutoRequest) {
      const autoRes = inferOptimalSchedule(matched, medName);
      resolvedTimings = autoRes.timings;
      resolvedFreq = autoRes.frequency;
      scheduleReason = autoRes.reason;
    } else {
      // 사용자가 직접 설정한 복용 시간대(배열 또는 단일값)
      if (Array.isArray(med.timings) && med.timings.length > 0) {
        resolvedTimings = med.timings;
      } else if (med.timing) {
        resolvedTimings = [med.timing];
      } else {
        resolvedTimings = [matched?.defaultTiming || 'morning_after'];
      }
    }

    if (matched) {
      return {
        id: matched.id || `med_${idx}`,
        name: matched.name,
        inputName: medName,
        category: matched.category,
        efficacy: matched.efficacy,
        timings: resolvedTimings,
        frequency: resolvedFreq,
        isAutoScheduled: isAutoRequest,
        scheduleReason,
        dosage: med.dosage || matched.dosage,
        storage: matched.storage,
        criticalWarnings: matched.criticalWarnings || [],
        administrationTips: matched.administrationTips,
        sideEffects: matched.sideEffects,
        foodWarnings: matched.foodWarnings || [],
        supplementTips: matched.supplementTips || ''
      };
    } else {
      // 커스텀 약물
      return {
        id: `custom_${idx}`,
        name: medName,
        inputName: medName,
        category: "처방/일반 의약품",
        efficacy: "처방 목적에 따른 규칙적 복용",
        timings: resolvedTimings,
        frequency: resolvedFreq,
        isAutoScheduled: isAutoRequest,
        scheduleReason: scheduleReason || "식사 리듬에 맞춘 규칙적 복용",
        dosage: med.dosage || "1회 처방 용량 준수",
        storage: "직사광선을 피하고 실온 건조한 곳에 보관",
        criticalWarnings: [
          {
            type: "general",
            severity: "medium",
            icon: "fa-shield-halved",
            badge: "⚠️ 복용량 및 시간 엄수",
            title: "임의로 용량을 증감하지 마세요",
            detail: "의사 또는 약사의 복약 지침을 반드시 준수하고, 이상 증상 시 즉시 문의하세요."
          }
        ],
        administrationTips: [
          "충분한 양의 물(200ml 이상)과 함께 복용하세요.",
          "규칙적인 시간에 복용하세요."
        ],
        sideEffects: "두통, 속쓰림, 어지러움 발생 시 전문가와 상담하세요.",
        foodWarnings: [
          {
            food: "술 (알코올)",
            severity: "danger",
            reason: "약물 대사 부담 및 간독성 위험이 있으므로 금주하세요."
          }
        ],
        supplementTips: "다른 영양제와는 1~2시간 시차를 두고 복용하는 것이 좋습니다."
      };
    }
  });

  // 2. 대형 시각화 전용 핵심 주의사항 모음 (Critical Warnings)
  // 졸림, 운전금지, 음주금기, 눕기금지 등 일상 안전 직결 경고 추출
  const collectedCriticalWarnings = [];
  analyzedMeds.forEach(med => {
    (med.criticalWarnings || []).forEach(w => {
      collectedCriticalWarnings.push({
        ...w,
        drugName: med.name
      });
    });
  });

  // 위험도 순 정렬 (danger -> high -> medium)
  const severityRank = { danger: 3, high: 2, medium: 1 };
  collectedCriticalWarnings.sort((a, b) => (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0));

  // 3. 시간대별 타임라인 구성 (하루 다회 복용 약물 중복 분배)
  const timelineSlots = {
    morning_before: [],
    morning_after: [],
    lunch_after: [],
    evening_after: [],
    bedtime: []
  };

  analyzedMeds.forEach(med => {
    med.timings.forEach(timingKey => {
      if (timelineSlots[timingKey]) {
        timelineSlots[timingKey].push({
          ...med,
          currentSlot: timingKey
        });
      }
    });
  });

  const timeline = Object.keys(TIMING_LABELS).map(key => ({
    key: key,
    title: TIMING_LABELS[key].title,
    icon: TIMING_LABELS[key].icon,
    time: TIMING_LABELS[key].time,
    items: timelineSlots[key]
  }));

  // 4. 약물 간 상호작용(DDI) 및 중복 검사
  const ddiWarnings = [];
  const medNames = analyzedMeds.map(m => m.name);

  knowledgeBase.ddiRules.forEach(rule => {
    const isTriggered = rule.drugs.every(drugName => 
      medNames.some(mName => mName.includes(drugName) || drugName.includes(mName))
    );

    if (isTriggered) {
      ddiWarnings.push({
        title: rule.title,
        severity: rule.severity,
        drugs: rule.drugs,
        description: rule.description,
        action: rule.action
      });
    }
  });

  // 동일 효능군 중복 검사
  const categoryCounts = {};
  analyzedMeds.forEach(med => {
    if (med.category && !med.category.includes("처방/일반")) {
      categoryCounts[med.category] = (categoryCounts[med.category] || 0) + 1;
    }
  });

  Object.entries(categoryCounts).forEach(([cat, count]) => {
    if (count > 1) {
      ddiWarnings.push({
        title: `동일 효능군(${cat}) 중복 투약 주의`,
        severity: "warning",
        drugs: analyzedMeds.filter(m => m.category === cat).map(m => m.name),
        description: `동일한 약효군인 '${cat}'에 속하는 약물이 ${count}종 복용 중입니다. 중복 처방인지 확인하세요.`,
        action: "처방의 또는 조제 약사에게 중복 투약 여부를 확인하세요."
      });
    }
  });

  let safetyScore = "안전";
  if (ddiWarnings.some(w => w.severity === 'danger')) {
    safetyScore = "주의/위험";
  } else if (ddiWarnings.some(w => w.severity === 'warning')) {
    safetyScore = "관찰 필요";
  }

  // 5. 음식 및 영양제 상호작용
  const combinedFoodWarnings = [];
  const foodSeen = new Set();

  analyzedMeds.forEach(med => {
    med.foodWarnings.forEach(fw => {
      const key = `${fw.food}_${fw.severity}`;
      if (!foodSeen.has(key)) {
        foodSeen.add(key);
        combinedFoodWarnings.push({
          food: fw.food,
          severity: fw.severity,
          reason: fw.reason,
          relatedDrugs: [med.name]
        });
      } else {
        const existing = combinedFoodWarnings.find(x => `${x.food}_${x.severity}` === key);
        if (existing && !existing.relatedDrugs.includes(med.name)) {
          existing.relatedDrugs.push(med.name);
        }
      }
    });
  });

  const combinedSupplements = analyzedMeds
    .filter(m => m.supplementTips)
    .map(m => ({ drug: m.name, tip: m.supplementTips }));

  // 6. 맞춤 식단 및 운동 가이드
  const dietPlans = [];
  conditions.forEach(cond => {
    const matchedDiet = knowledgeBase.diseaseDiet[cond];
    if (matchedDiet) {
      dietPlans.push({
        condition: cond,
        recommend: matchedDiet.recommend,
        avoid: matchedDiet.avoid,
        waterIntake: matchedDiet.waterIntake,
        keyTip: matchedDiet.keyTip
      });
    }
  });

  if (dietPlans.length === 0) {
    dietPlans.push({
      condition: "일반 건강 관리",
      recommend: ["균형 잡힌 잡곡밥과 신선한 채소", "고단백 저지방 생선 및 두부", "계절 과일 적정량"],
      avoid: ["고나트륨 찌개 및 가공육", "단순당 함유 탄산음료", "잦은 야식"],
      waterIntake: "하루 1.5~2L 충분한 수분 섭취",
      keyTip: "규칙적인 식사 리듬을 유지해 약물 흡수를 일정하게 돕습니다."
    });
  }

  let ageBracketKey = 'middle';
  if (ageNum < 50) ageBracketKey = 'young';
  else if (ageNum >= 70) ageBracketKey = 'senior';

  const ageExercise = knowledgeBase.exerciseGuide.ageBracket[ageBracketKey] || knowledgeBase.exerciseGuide.ageBracket.middle;
  const heightEstimated = gender === 'M' || gender === '남성' ? 172 : 160;
  const bmi = (weightNum / Math.pow(heightEstimated / 100, 2)).toFixed(1);
  let bmiNote = "표준 체중";
  if (bmi >= 25) bmiNote = "과체중/비만 경향 (관절 부담 없는 유산소 권장)";
  else if (bmi < 18.5) bmiNote = "저체중 (점진적 근력 강화 권장)";

  const relevantMedExerciseWarnings = [];
  analyzedMeds.forEach(m => {
    knowledgeBase.exerciseGuide.medicationSafety.forEach(ms => {
      if (m.category.includes(ms.category) || m.name.includes(ms.category)) {
        if (!relevantMedExerciseWarnings.some(w => w.category === ms.category)) {
          relevantMedExerciseWarnings.push(ms);
        }
      }
    });
  });

  const exercisePlan = {
    ageGroup: ageExercise.title,
    recommend: ageExercise.recommend,
    intensity: ageExercise.intensity,
    ageTip: ageExercise.tip,
    bmi: `${bmi} (${bmiNote})`,
    medWarnings: relevantMedExerciseWarnings
  };

  return {
    patientName: patientName || "익명 환자",
    gender: gender === 'M' || gender === '남성' ? "남성" : "여성",
    age: ageNum,
    weight: weightNum,
    conditions,
    medications: analyzedMeds,
    criticalWarnings: collectedCriticalWarnings,
    safetyScore,
    timeline,
    ddiWarnings,
    foodWarnings: combinedFoodWarnings,
    supplements: combinedSupplements,
    dietPlans,
    exercisePlan,
    createdAt: new Date().toISOString()
  };
}

module.exports = {
  findDrugInfo,
  inferOptimalSchedule,
  generateMedicationGuidance,
  knowledgeBase
};
