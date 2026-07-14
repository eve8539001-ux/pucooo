import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: "지원하지 않는 메소드입니다." });
  }

  const { scenario, settings = {} } = req.body;
  
  if (!scenario || !scenario.trim()) {
    return res.status(400).json({ error: "상황 문장을 입력해주세요." });
  }

  const selectionMode = settings.selectionMode || 'essential';
  const codeValidation = settings.codeValidation || {
    removeNonExistent: true,
    removeDuplicates: true,
    preventMutation: true,
    preventFuzzyDuplicates: true
  };
  const outputLanguage = settings.outputLanguage || 'ko';
  const useEnglish = outputLanguage === 'en';

  const dbPath = path.join(process.cwd(), 'puco_capability_db.json');
  const systemPromptPath = path.join(process.cwd(), 'system_prompt.txt');

  let capabilityDb;
  let systemPromptTemplate;

  try {
    capabilityDb = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
    systemPromptTemplate = fs.readFileSync(systemPromptPath, 'utf-8');
  } catch (err) {
    console.error("Vercel Serverless Init Error:", err);
    return res.status(500).json({ error: "서버 설정 파일(DB 또는 프롬프트)을 읽어오지 못했습니다." });
  }

  const snList = capabilityDb.SN.map(item => `${item.code}|${item.category}|${item.name}`).join('\n');
  const mpList = capabilityDb.MP.map(item => `${item.code}|${item.category}|${item.name}`).join('\n');
  const pjList = capabilityDb.PJ.map(item => `${item.code}|${item.category}|${item.name}`).join('\n');
  const spList = capabilityDb.SP.map(item => `${item.code}|${item.category}|${item.name}`).join('\n');

  const systemPrompt = systemPromptTemplate
    .replace('[SN_CONDENSED_DATA]', snList)
    .replace('[MP_CONDENSED_DATA]', mpList)
    .replace('[PJ_CONDENSED_DATA]', pjList)
    .replace('[SP_CONDENSED_DATA]', spList);

  const validCodes = new Set([
    ...capabilityDb.SN.map(i => i.code),
    ...capabilityDb.MP.map(i => i.code),
    ...capabilityDb.PJ.map(i => i.code),
    ...capabilityDb.SP.map(i => i.code)
  ]);

  // LOCAL MATCH ENGINE
  const localScenarios = [
    {
      keywords: ["필드", "넘겨", "넘기", "다음", "화면", "전환", "바꿔", "바꾸"],
      sensing: "SN-C-02",
      motion: "MP-C01",
      projection: "PJ-C04",
      speaker: "SP-B01",
      summary: "화면 전환 및 다음 필드 넘기기 시나리오",
      summaryEn: "Screen transition and next field navigation scenario",
      meaning: "사용자가 손짓으로 화면 전환 제스처를 취하는 것을 감지하고(SN-C-02), 암을 펼쳐 화면 투사면을 정렬한 뒤(MP-C01) 확인하는 짧은 대답(SP-B01)과 함께 사용자 앞 테이블에 새로운 화면(PJ-C04)을 투사하여 다음 필드로 전환합니다."
    },
    {
      keywords: ["안녕", "반갑", "반가워", "인사", "안뇽", "하이", "웰컴", "반가움"],
      sensing: "SN-B-01",
      motion: "MP-B05",
      projection: "PJ-C03",
      speaker: "SP-E01",
      summary: "반갑게 사용자 얼굴을 맞이하며 인사하는 시나리오",
      summaryEn: "Greet the user happily with face recognition",
      meaning: "사용자의 얼굴을 검출하여 식별하고(SN-B-01), 몸을 앞뒤로 가볍게 흔들어 반갑게 반응하며(MP-B05), 밝고 활기찬 목소리(SP-E01)와 소형 웰컴 화면(PJ-C03)을 테이블에 투사하여 환영의 감정을 표현합니다."
    },
    {
      keywords: ["부끄", "수줍", "거절", "싫어", "싫구", "피해", "피하", "곤란"],
      sensing: "SN-B-02",
      motion: "MP-A05",
      projection: "PJ-E01",
      speaker: "SP-E05",
      summary: "수줍음과 거절의 감정 회피 표현 시나리오",
      summaryEn: "Shyness and hesitation emotional expression",
      meaning: "사용자의 곤란해하거나 당황한 표정을 감지하고(SN-B-02), 로봇 몸체를 슬쩍 돌려 시선을 회피하며(MP-A05), 귀여운 캐릭터 톤(SP-E05)으로 수줍음을 표현하고 조도를 낮춘 은은한 밝기(PJ-E01)로 감정에 맞춘 연출을 진행합니다."
    },
    {
      keywords: ["위험", "경고", "비상", "조심", "안전", "문제", "사고", "움찔"],
      sensing: "SN-A-01",
      motion: "MP-B03",
      projection: "PJ-C01",
      speaker: "SP-A03",
      summary: "접근 경고 및 긴급 대피 회피 시나리오",
      summaryEn: "Proximity alert and warning scenario",
      meaning: "정밀 거리 측정을 통해 장애물이나 사용자가 비정상적으로 근접한 상황을 감지하고(SN-A-01), 몸을 뒤로 젖혀 움찔 물러나며 경계 태세를 취함과 동시에(MP-B03), 경고용 반복 효과음(SP-A03)을 울리고 위험 지점을 포인트 투사(PJ-C01)로 표시하여 주의를 줍니다."
    },
    {
      keywords: ["대기", "호흡", "가만", "숨", "쉬어", "자고", "정지"],
      sensing: "SN-C-03",
      motion: "MP-G01",
      projection: "PJ-D01",
      speaker: "SP-C01",
      summary: "대기 호흡 상태 및 배경음악 반복 시나리오",
      summaryEn: "Breathing idle animation and looping background music",
      meaning: "카메라 프레임 내 사람 수를 간헐적으로 파악하면서(SN-C-03), 대기 상태에서도 살아있는 생명체처럼 미세하게 위아래로 호흡하듯 움직이고(MP-G01), 잔잔한 배경음악을 반복 재생(SP-C01)하며 테이블에 대기 모드 안내 화면(PJ-D01)을 차분하게 고정 투사합니다."
    },
    {
      keywords: ["따라", "추적", "바라봐", "쳐다", "움직", "이동", "졸졸", "시선"],
      sensing: "SN-C-04",
      motion: "MP-F02",
      projection: "PJ-D03",
      speaker: "SP-B03",
      summary: "사용자 실시간 동선 추적 및 화면 이동 시나리오",
      summaryEn: "Real-time user tracking and target projection flow",
      meaning: "사용자의 좌표와 실시간 움직임을 연속 추적하여(SN-C-04), 고개가 먼저 따라가고 몸체가 회전하며 자세를 부드럽게 정렬하고(MP-F02), 사용자가 바라보는 테이블 면에 화면을 실시간으로 추적 투사하며(PJ-D03), 사용자의 동선 반응에 즉각 실시간 피드백 음향(SP-B03)을 전달합니다."
    }
  ];

  const translateToEn = (text) => {
    const dict = {
      "시나리오 상황과 매칭되는 센서 감지를 활성화함.": "Activate sensor detection matching the scenario.",
      "키워드 의도에 맞춰 모션 자세 제어를 수행함.": "Execute motion control matching the keyword intent.",
      "동작 반응에 맞춘 연동 프로젝션 영역을 투사함.": "Project corresponding display aligned with motion response.",
      "감정 표현을 위한 스피커 반응을 재생함.": "Play speaker response for emotional expression."
    };
    return dict[text] || text;
  };

  function matchLocalScenario(inputText, useEnglishFlag) {
    const text = inputText.trim();
    const useEng = typeof useEnglish !== 'undefined' ? useEnglish : (useEnglishFlag || false);
    
    const matchedSN = [];
    const matchedMP = [];
    const matchedPJ = [];
    const matchedSP = [];

    // Evaluate Trigger categories
    const isToFTrigger = ["거리", "가깝", "가까이", "멀어", "다가오", "이탈", "접근", "cm", "m", "초점", "스케일", "재질", "평탄", "근접"].some(w => text.includes(w));
    const isCameraTrigger = ["바라", "쳐다", "보더", "보니", "얼굴", "표정", "눈", "시선", "자세", "동작", "포즈", "제스처", "손", "발", "사람", "인원", "터치", "조도", "밝기", "사물", "객체", "도구"].some(w => text.includes(w));

    // Dynamic scoring using localScenarios + db
    const getMatchScore = (input, item, categoryType) => {
      let score = 0;
      const lowerInput = input.toLowerCase();
      
      // Boost from localScenarios mapping
      for (const rule of localScenarios) {
        if (rule.keywords.some(k => lowerInput.includes(k))) {
          if (categoryType === 'SN' && rule.sensing === item.code) score += 20;
          if (categoryType === 'MP' && rule.motion === item.code) score += 20;
          if (categoryType === 'PJ' && rule.projection === item.code) score += 20;
          if (categoryType === 'SP' && rule.speaker === item.code) score += 20;
        }
      }

      // Basic text matching against DB fields
      const dbKeywords = [item.category, item.name, item.desc].filter(Boolean);
      for (const kw of dbKeywords) {
        if (!kw) continue;
        const lowerKw = kw.toLowerCase();
        if (lowerInput.includes(lowerKw)) score += 5;
        // Check partial match
        const words = lowerInput.split(' ');
        for (const word of words) {
          if (word.length > 1 && (lowerKw.includes(word) || word.includes(lowerKw))) {
            score += 1.5;
          }
        }
      }
      return score;
    };

    // Evaluate all SN capabilities
    for (const item of capabilityDb.SN) {
      if (item.enabled === false) continue;
      const score = getMatchScore(text, item, 'SN');
      const isToFCode = item.code.startsWith("SN-A");
      
      if (isToFCode && !isToFTrigger && score < 15) continue;
      if (!isToFCode && !isCameraTrigger && score < 15) continue;
      
      if (score >= 5.0) matchedSN.push({ code: item.code, score: score });
    }

    // Evaluate MP
    for (const item of capabilityDb.MP) {
      if (item.enabled === false) continue;
      const score = getMatchScore(text, item, 'MP');
      if (score >= 6.0) matchedMP.push({ code: item.code, score: score });
    }

    // Evaluate PJ 
    const isProjectionNeeded = ["빔", "투사", "화면", "스크린", "보여", "표시", "영상", "이미지", "빛", "조명", "벽", "테이블"].some(w => text.includes(w));
    for (const item of capabilityDb.PJ) {
      if (item.enabled === false) continue;
      const score = getMatchScore(text, item, 'PJ');
      // Require projection trigger unless highly matched
      if (!isProjectionNeeded && score < 18) continue;
      if (score >= 6.0) matchedPJ.push({ code: item.code, score: score });
    }

    // Evaluate SP 
    const isSpeakerNeeded = ["소리", "음성", "말하", "말했", "음악", "효과음", "노래", "사운드", "안내", "말해", "대답", "목소리", "톤"].some(w => text.includes(w));
    for (const item of capabilityDb.SP) {
      if (item.enabled === false) continue;
      const score = getMatchScore(text, item, 'SP');
      // Require speaker trigger unless highly matched
      if (!isSpeakerNeeded && score < 18) continue;
      if (score >= 6.0) matchedSP.push({ code: item.code, score: score });
    }

    const sortAndFormat = (items, labelKo, labelEn) => {
      // Sort desc, remove duplicates, take top 3
      const unique = [];
      const seen = new Set();
      items.sort((a, b) => b.score - a.score).forEach(item => {
        if (!seen.has(item.code)) {
          seen.add(item.code);
          unique.push(item);
        }
      });

      return unique.slice(0, 3).map(item => ({
        code: item.code,
        reason: useEng ? `Activated due to trigger matching ${labelEn}.` : `상황 인풋 분석 결과 ${labelKo} 거동에 부합함.`
      }));
    };

    let finalSN = sortAndFormat(matchedSN, "센서 감지", "sensing trigger");
    if (finalSN.length === 0) {
      if (isToFTrigger) {
        finalSN = [{ code: "SN-A01", reason: "물리적 거리/접근 센서 선행 작동" }];
      } else if (isCameraTrigger) {
        finalSN = [{ code: "SN-B01", reason: "시각 인식을 위한 카메라 센서 선행 작동" }];
      }
    }

    const missingIntent = text.length < 8;
    const summaryText = useEng 
      ? `Estimated capabilities match for: "${text.substring(0, 15)}${text.length > 15 ? '...' : ''}"`
      : `입력 상황 "${text.substring(0, 15)}${text.length > 15 ? '...' : ''}"에 대한 최적 추정 매칭 결과`;

    const intentNoteText = missingIntent 
      ? (useEng ? "Provide explicit triggers and robot emotions to improve matching." : "구체적인 트리거와 로봇의 감정을 명시하면 더 명확해요.")
      : "";

    return {
      summary: summaryText,
      missingIntent: missingIntent,
      intentNote: intentNoteText,
      SN: finalSN,
      MP: sortAndFormat(matchedMP, "모션 반응", "motion response"),
      PJ: sortAndFormat(matchedPJ, "투사 반응", "projection response"),
      SP: sortAndFormat(matchedSP, "스피커 반응", "speaker response")
    };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const isPlaceholder = !apiKey || apiKey.trim() === '' || apiKey.startsWith('sk-ant-api03-placeholder');

  if (isPlaceholder) {
    const localResult = matchLocalScenario(scenario);
    
    const filterValidCodes = (items) => {
      return items.filter(item => {
        const detail = [
          ...capabilityDb.SN,
          ...capabilityDb.MP,
          ...capabilityDb.PJ,
          ...capabilityDb.SP
        ].find(i => i.code === item.code);
        if (detail && detail.enabled === false) return false;
        return validCodes.has(item.code);
      });
    };

    return res.status(200).json({
      summary: (useEnglish ? "[Local Match] " : "[로컬 매칭] ") + localResult.summary,
      missingIntent: localResult.missingIntent,
      intentNote: localResult.intentNote,
      SN: filterValidCodes(localResult.SN),
      MP: filterValidCodes(localResult.MP),
      PJ: filterValidCodes(localResult.PJ),
      SP: filterValidCodes(localResult.SP)
    });
  }

  // AI CLAUDE MATCH RULES
  let requestSystemPrompt = systemPrompt;
  
  if (selectionMode === 'essential') {
    requestSystemPrompt += "\n\nCRITICAL SELECTION MODE RULE: Focus on 'Essential Only'. Select only the absolute minimal required capability codes needed to satisfy the trigger and response (usually exactly 1 code per category, or empty array if not applicable). Do not recommend secondary or nice-to-have capabilities.";
  } else if (selectionMode === 'detailed') {
    requestSystemPrompt += "\n\nCRITICAL SELECTION MODE RULE: Focus on 'Detailed' mapping. Select all capabilities that could be even slightly relevant or helpful to fully cover the scenario (up to 3 codes per category if appropriate). Provide detailed recommendations.";
  } else {
    requestSystemPrompt += "\n\nCRITICAL SELECTION MODE RULE: Focus on 'Balanced' mapping. Select the primary codes that naturally represent the scenario (typically 1 or 2 codes per category).";
  }

  if (useEnglish) {
    requestSystemPrompt += "\n\nCRITICAL LANGUAGE RULE: Write the 'summary', all item 'reason' texts, and the 'intentNote' strictly in English.";
  } else {
    requestSystemPrompt += "\n\nCRITICAL LANGUAGE RULE: Write the 'summary', all item 'reason' texts, and the 'intentNote' strictly in Korean.";
  }

  if (codeValidation.preventFuzzyDuplicates) {
    requestSystemPrompt += "\n\nCRITICAL SIMILARITY RULE: Prevent duplicate selection of similar functions. Within each category, do not select multiple codes that perform almost the exact same action (e.g. do not select both MP-D01 and MP-D02 together). Recommend only the most relevant one.";
  }

  if (codeValidation.preventMutation) {
    requestSystemPrompt += "\n\nCRITICAL MUTATION RULE: Do not change, modify, or mutate the characters or numbers of the capability codes (e.g. SN-A-01 must never be written as SN-A01 or SN-A1). Only select codes from the list exactly as shown.";
  }

  let messages = [{ role: 'user', content: `Analyze the following scenario: "${scenario.trim()}"` }];
  let retries = 0;
  let success = false;
  let resultJSON = null;

  while (retries < 3 && !success) {
    try {
      const apiResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 1000,
          system: requestSystemPrompt,
          messages: messages
        })
      });

      if (!apiResponse.ok) {
        const errText = await apiResponse.text();
        throw new Error(`Anthropic API status ${apiResponse.status}: ${errText}`);
      }

      const data = await apiResponse.json();
      const replyText = data.content[0].text.trim();

      try {
        const cleanedText = replyText.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
        const parsed = JSON.parse(cleanedText);

        if (parsed.summary && parsed.SN && parsed.MP && parsed.PJ && parsed.SP) {
          resultJSON = parsed;
          success = true;
        } else {
          throw new Error("Missing summary, SN, MP, PJ, or SP in Claude response");
        }
      } catch (jsonErr) {
        console.warn(`JSON validation failed on attempt ${retries + 1}:`, jsonErr.message);
        messages.push({ role: 'assistant', content: replyText });
        messages.push({ 
          role: 'user', 
          content: "방금 응답이 유효한 JSON이 아니었어. 설명이나 마크다운 코드블록 표기 없이 순수 JSON 객체 하나만 다시 출력해줘." 
        });
        retries++;
      }
    } catch (connErr) {
      console.error("Claude connection error:", connErr);
      return res.status(502).json({ error: `Claude API 연동 장애: ${connErr.message}` });
    }
  }

  if (!success) {
    return res.status(422).json({ 
      error: "형식을 맞추지 못했습니다. 문장을 더 구체적으로 바꿔 다시 시도해주세요." 
    });
  }

  const filterValidCodes = (items) => {
    if (!Array.isArray(items)) return [];
    let processed = [];
    const seen = new Set();

    for (const item of items) {
      if (!item || typeof item.code !== 'string') continue;
      let code = item.code.trim();

      if (!codeValidation.preventMutation) {
        if (!validCodes.has(code)) {
          if (code.startsWith('SN-') && code.length === 6) {
            const check = code.substring(0, 4) + '-' + code.substring(4);
            if (validCodes.has(check)) code = check;
          }
          if (code.startsWith('MP-') && code.includes('-', 3)) {
            const check = code.replace(/-([0-9]+)$/, '$1');
            if (validCodes.has(check)) code = check;
          }
        }
      }

      if (codeValidation.removeNonExistent && !validCodes.has(code)) continue;

      const dbItem = [
        ...capabilityDb.SN,
        ...capabilityDb.MP,
        ...capabilityDb.PJ,
        ...capabilityDb.SP
      ].find(i => i.code === code);
      if (dbItem && dbItem.enabled === false) continue;

      if (codeValidation.removeDuplicates) {
        if (seen.has(code)) continue;
        seen.add(code);
      }

      processed.push({
        code: code,
        reason: item.reason
      });
    }

    return processed;
  };

  const validatedResult = {
    summary: resultJSON.summary,
    missingIntent: !!resultJSON.missingIntent,
    intentNote: resultJSON.intentNote || "",
    SN: filterValidCodes(resultJSON.SN),
    MP: filterValidCodes(resultJSON.MP),
    PJ: filterValidCodes(resultJSON.PJ),
    SP: filterValidCodes(resultJSON.SP)
  };

  return res.status(200).json(validatedResult);
}
