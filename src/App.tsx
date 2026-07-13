import { useState, useEffect, useMemo, useRef } from 'react';

interface CapabilityItem {
  code: string;
  grammar: string;
  category: string;
  name: string;
  desc: string;
  example: string;
  keywords?: string;
  enabled?: boolean;
}

interface CapabilityDatabase {
  SN: CapabilityItem[];
  MP: CapabilityItem[];
  PJ: CapabilityItem[];
  SP: CapabilityItem[];
}

interface MatchReason {
  code: string;
  reason: string;
}

interface MatchResult {
  summary: string;
  missingIntent: boolean;
  intentNote: string;
  SN: MatchReason[];
  MP: MatchReason[];
  PJ: MatchReason[];
  SP: MatchReason[];
}

interface SavedScenario {
  id: string;
  scenarioText: string;
  timestamp: string;
  result: MatchResult;
}

const PRESET_SCENARIOS = [
  { text: "사용자가 푸코를 바라볼 때, 푸코가 반가움을 표현한다", label: "얼굴 인식 & 인사 반응" },
  { text: "사용자가 손짓으로 넘길 때, 푸코가 다음 필드로 화면을 넘겨준다", label: "제스처 & 화면 전환" },
  { text: "사용자가 갑자기 다가올 때, 푸코가 놀라서 움찔 물러서며 위험 경고를 한다", label: "거리 감지 & 안전 확보" },
  { text: "사용자가 푸코에게 말을 걸 때, 푸코가 차분히 귀기울이며 응답한다", label: "경청 모션 & 부드러운 발화" }
];

export default function App() {
  const [database, setDatabase] = useState<CapabilityDatabase | null>(null);
  const [scenarioText, setScenarioText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  
  // Navigation State
  const [currentView, setCurrentView] = useState<'console' | 'saved' | 'assets' | 'settings'>('console');
  
  // Saved Scenarios State
  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>([]);
  const [savedSearchQuery, setSavedSearchQuery] = useState("");
  
  // Settings Panel States (stored in localStorage)
  const [selectionMode, setSelectionMode] = useState<'essential' | 'balanced' | 'detailed'>('essential');
  const [validationRemoveNonExistent, setValidationRemoveNonExistent] = useState(true);
  const [validationRemoveDuplicates, setValidationRemoveDuplicates] = useState(true);
  const [validationVerifyName, setValidationVerifyName] = useState(true);
  const [validationPreventFuzzyDuplicates, setValidationPreventFuzzyDuplicates] = useState(true);
  const [validationPreventMutation, setValidationPreventMutation] = useState(true);
  const [outputLanguage, setOutputLanguage] = useState<'ko' | 'en'>('ko');

  // Database Browser States
  const [activeTab, setActiveTab] = useState<'All' | 'SN' | 'MP' | 'PJ' | 'SP'>('All');
  const [searchQuery, setSearchQuery] = useState("");

  // CRUD Modal Form States
  const [showAddEditModal, setShowAddEditModal] = useState(false);
  const [editingItem, setEditingItem] = useState<CapabilityItem | null>(null);
  const [formCode, setFormCode] = useState("");
  const [formGrammar, setFormGrammar] = useState("센서(SN)");
  const [formCategory, setFormCategory] = useState("");
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formExample, setFormExample] = useState("");
  const [formKeywords, setFormKeywords] = useState("");
  const [formEnabled, setFormEnabled] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load database and saved scenarios on mount
  useEffect(() => {
    // 1. Fetch capability database
    fetch('/api/database')
      .then(res => {
        if (!res.ok) throw new Error("데이터베이스 로드 실패");
        return res.json();
      })
      .then(data => {
        // Enforce default properties (keywords, enabled)
        const normalize = (items: CapabilityItem[]) => 
          items.map(item => ({
            ...item,
            keywords: item.keywords || "",
            enabled: item.enabled === undefined ? true : item.enabled
          }));
        
        setDatabase({
          SN: normalize(data.SN || []),
          MP: normalize(data.MP || []),
          PJ: normalize(data.PJ || []),
          SP: normalize(data.SP || [])
        });
      })
      .catch(err => {
        console.error(err);
        setError("데이터베이스를 읽어오지 못했습니다. 서버 상태를 확인해주세요.");
      });

    // 2. Load saved scenarios from localStorage
    const saved = localStorage.getItem('puko_saved_scenarios');
    if (saved) {
      try {
        setSavedScenarios(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load saved scenarios:", e);
      }
    }

    // 3. Load settings from localStorage
    const savedMode = localStorage.getItem('puko_settings_selectionMode');
    if (savedMode) setSelectionMode(savedMode as any);
    
    const savedLang = localStorage.getItem('puko_settings_outputLanguage');
    if (savedLang) setOutputLanguage(savedLang as any);

    const savedValRemoveNonExistent = localStorage.getItem('puko_settings_valRemoveNonExistent');
    if (savedValRemoveNonExistent) setValidationRemoveNonExistent(savedValRemoveNonExistent === 'true');

    const savedValRemoveDuplicates = localStorage.getItem('puko_settings_valRemoveDuplicates');
    if (savedValRemoveDuplicates) setValidationRemoveDuplicates(savedValRemoveDuplicates === 'true');

    const savedValVerifyName = localStorage.getItem('puko_settings_valVerifyName');
    if (savedValVerifyName) setValidationVerifyName(savedValVerifyName === 'true');

    const savedValPreventFuzzy = localStorage.getItem('puko_settings_valPreventFuzzy');
    if (savedValPreventFuzzy) setValidationPreventFuzzyDuplicates(savedValPreventFuzzy === 'true');

    const savedValPreventMutation = localStorage.getItem('puko_settings_valPreventMutation');
    if (savedValPreventMutation) setValidationPreventMutation(savedValPreventMutation === 'true');
  }, []);

  // Sync settings helper
  const saveSetting = (key: string, value: any) => {
    localStorage.setItem(key, String(value));
  };

  // Compute active codes currently matched in the console
  const activeCodes = useMemo(() => {
    if (!matchResult) return [];
    return [
      ...(matchResult.SN || []).map(i => i.code),
      ...(matchResult.MP || []).map(i => i.code),
      ...(matchResult.PJ || []).map(i => i.code),
      ...(matchResult.SP || []).map(i => i.code)
    ];
  }, [matchResult]);

  // Lookup helper for capability details
  const getCapabilityDetail = (code: string) => {
    if (!database) return null;
    return database.SN.find(item => item.code === code) ||
           database.MP.find(item => item.code === code) ||
           database.PJ.find(item => item.code === code) ||
           database.SP.find(item => item.code === code) || null;
  };

  // Synthesize scenario action
  const handleSynthesize = async (textToUse?: string) => {
    const query = textToUse !== undefined ? textToUse : scenarioText;
    if (!query.trim()) return;

    setLoading(true);
    setError(null);

    // Build settings payload
    const settingsPayload = {
      selectionMode,
      codeValidation: {
        removeNonExistent: validationRemoveNonExistent,
        removeDuplicates: validationRemoveDuplicates,
        preventMutation: validationPreventMutation,
        preventFuzzyDuplicates: validationPreventFuzzyDuplicates
      },
      outputLanguage
    };

    try {
      const res = await fetch('/api/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          scenario: query,
          settings: settingsPayload
        })
      });

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "합성 중 에러가 발생했습니다.");
      }

      setMatchResult(data);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "서버와 통신하는 중 문제가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  // Save scenario action
  const handleSaveScenario = () => {
    if (!matchResult || !scenarioText.trim()) return;

    const isDuplicate = savedScenarios.some(
      s => s.scenarioText.trim() === scenarioText.trim() && 
      JSON.stringify(s.result.summary) === JSON.stringify(matchResult.summary)
    );

    if (isDuplicate) {
      alert("이미 동일하게 저장된 시나리오가 존재합니다.");
      return;
    }

    const newSaved: SavedScenario = {
      id: Date.now().toString(),
      scenarioText: scenarioText.trim(),
      timestamp: new Date().toLocaleString('ko-KR', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }),
      result: matchResult
    };

    const updated = [newSaved, ...savedScenarios];
    setSavedScenarios(updated);
    localStorage.setItem('puko_saved_scenarios', JSON.stringify(updated));
    alert("시나리오가 성공적으로 저장되었습니다!");
  };

  // Delete saved scenario action
  const handleDeleteScenario = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("정말 이 시나리오를 삭제하시겠습니까?")) return;

    const updated = savedScenarios.filter(s => s.id !== id);
    setSavedScenarios(updated);
    localStorage.setItem('puko_saved_scenarios', JSON.stringify(updated));
  };

  // Load saved scenario back to console
  const handleLoadScenario = (scenario: SavedScenario) => {
    setScenarioText(scenario.scenarioText);
    setMatchResult(scenario.result);
    setCurrentView('console');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Tab rows rendering helper (filters by category and text)
  const filteredDatabaseItems = useMemo(() => {
    if (!database) return [];
    
    let list: CapabilityItem[] = [];
    if (activeTab === 'All') {
      list = [...database.SN, ...database.MP, ...database.PJ, ...database.SP];
    } else {
      list = database[activeTab] || [];
    }

    const q = searchQuery.toLowerCase().trim();
    if (!q) return list;

    return list.filter(item => 
      item.code.toLowerCase().includes(q) ||
      item.name.toLowerCase().includes(q) ||
      item.desc.toLowerCase().includes(q) ||
      (item.keywords && item.keywords.toLowerCase().includes(q))
    );
  }, [database, activeTab, searchQuery]);

  // Filter saved scenarios helper
  const filteredSavedScenarios = useMemo(() => {
    const q = savedSearchQuery.toLowerCase().trim();
    if (!q) return savedScenarios;
    return savedScenarios.filter(s => 
      s.scenarioText.toLowerCase().includes(q) ||
      s.result.summary.toLowerCase().includes(q) ||
      s.result.SN.some(i => i.code.toLowerCase().includes(q)) ||
      s.result.MP.some(i => i.code.toLowerCase().includes(q))
    );
  }, [savedScenarios, savedSearchQuery]);

  // Open Modal for Add
  const handleOpenAddModal = () => {
    setEditingItem(null);
    setFormCode("");
    setFormGrammar("센서(SN)");
    setFormCategory("");
    setFormName("");
    setFormDesc("");
    setFormExample("");
    setFormKeywords("");
    setFormEnabled(true);
    setShowAddEditModal(true);
  };

  // Open Modal for Edit
  const handleOpenEditModal = (item: CapabilityItem) => {
    setEditingItem(item);
    setFormCode(item.code);
    setFormGrammar(item.grammar);
    setFormCategory(item.category);
    setFormName(item.name);
    setFormDesc(item.desc);
    setFormExample(item.example);
    setFormKeywords(item.keywords || "");
    setFormEnabled(item.enabled === undefined ? true : item.enabled);
    setShowAddEditModal(true);
  };

  // Submit Capability Add/Edit
  const handleSaveCapability = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!database) return;

    if (!formCode.trim() || !formName.trim() || !formDesc.trim()) {
      alert("코드, 기능명, 설명은 필수 기입 항목입니다.");
      return;
    }

    const uppercaseCode = formCode.toUpperCase().trim();
    
    // Determine category key
    let targetKey: keyof CapabilityDatabase | null = null;
    if (uppercaseCode.startsWith('SN')) targetKey = 'SN';
    else if (uppercaseCode.startsWith('MP')) targetKey = 'MP';
    else if (uppercaseCode.startsWith('PJ')) targetKey = 'PJ';
    else if (uppercaseCode.startsWith('SP')) targetKey = 'SP';

    if (!targetKey) {
      alert("올바르지 않은 코드 접두사입니다. SN, MP, PJ, SP 중 하나로 시작해야 합니다. (예: SN-A-04)");
      return;
    }

    const newItem: CapabilityItem = {
      code: uppercaseCode,
      grammar: formGrammar.trim(),
      category: formCategory.trim(),
      name: formName.trim(),
      desc: formDesc.trim(),
      example: formExample.trim(),
      keywords: formKeywords.trim(),
      enabled: formEnabled
    };

    const dbCopy = {
      SN: [...database.SN],
      MP: [...database.MP],
      PJ: [...database.PJ],
      SP: [...database.SP]
    };

    // If editing
    if (editingItem) {
      // If code changed categories (e.g. from SN to MP), remove from old category
      let oldKey: keyof CapabilityDatabase | null = null;
      if (editingItem.code.startsWith('SN')) oldKey = 'SN';
      else if (editingItem.code.startsWith('MP')) oldKey = 'MP';
      else if (editingItem.code.startsWith('PJ')) oldKey = 'PJ';
      else if (editingItem.code.startsWith('SP')) oldKey = 'SP';

      if (oldKey) {
        dbCopy[oldKey] = dbCopy[oldKey].filter(i => i.code !== editingItem.code);
      }
    }

    // Check duplicate code (if it already exists in the new target category)
    const duplicate = dbCopy[targetKey].find(i => i.code === uppercaseCode);
    if (duplicate) {
      alert(`이미 등록되어 있는 코드입니다: ${uppercaseCode}`);
      return;
    }

    // Push new or updated
    dbCopy[targetKey].push(newItem);
    
    // Sort array by code alphabetically
    dbCopy[targetKey].sort((a, b) => a.code.localeCompare(b.code));

    try {
      // Save back to server
      const saveRes = await fetch('/api/database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dbCopy)
      });

      if (!saveRes.ok) throw new Error("서버 저장에 실패했습니다.");
      
      setDatabase(dbCopy);
      setShowAddEditModal(false);
      alert("캐퍼빌리티 정보가 성공적으로 반영되었습니다!");
    } catch (err: any) {
      console.error(err);
      alert(`저장 실패: ${err.message}`);
    }
  };

  // Delete Capability Row
  const handleDeleteCapability = async (item: CapabilityItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!database) return;
    if (!confirm(`정말 이 캐퍼빌리티를 삭제하시겠습니까?\n코드: ${item.code} (${item.name})`)) return;

    let targetKey: keyof CapabilityDatabase | null = null;
    if (item.code.startsWith('SN')) targetKey = 'SN';
    else if (item.code.startsWith('MP')) targetKey = 'MP';
    else if (item.code.startsWith('PJ')) targetKey = 'PJ';
    else if (item.code.startsWith('SP')) targetKey = 'SP';

    if (!targetKey) return;

    const dbCopy = {
      SN: database.SN.filter(i => i.code !== item.code),
      MP: database.MP.filter(i => i.code !== item.code),
      PJ: database.PJ.filter(i => i.code !== item.code),
      SP: database.SP.filter(i => i.code !== item.code)
    };

    try {
      const saveRes = await fetch('/api/database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dbCopy)
      });

      if (!saveRes.ok) throw new Error("서버 저장 실패");

      setDatabase(dbCopy);
      alert("성공적으로 삭제되었습니다.");
    } catch (err: any) {
      console.error(err);
      alert(`삭제 실패: ${err.message}`);
    }
  };

  // CSV Uploader File Handler
  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const text = evt.target?.result as string;
      if (!text) return;

      try {
        const lines = text.split(/\r?\n/);
        if (lines.length < 2) {
          alert("CSV 파일이 비어있거나 올바른 서식이 아닙니다.");
          return;
        }

        if (!database) return;
        const dbCopy = {
          SN: [...database.SN],
          MP: [...database.MP],
          PJ: [...database.PJ],
          SP: [...database.SP]
        };

        let addedCount = 0;
        let updatedCount = 0;

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          // Simple CSV cell parsing supporting double quotes
          const cells: string[] = [];
          let inQuotes = false;
          let currentCell = "";
          
          for (let charIndex = 0; charIndex < line.length; charIndex++) {
            const char = line[charIndex];
            if (char === '"') {
              inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
              cells.push(currentCell.trim());
              currentCell = "";
            } else {
              currentCell += char;
            }
          }
          cells.push(currentCell.trim());

          if (cells.length < 6) continue;

          const categoryVal = cells[0];
          const groupVal = cells[1];
          const codeVal = cells[2].toUpperCase().trim();
          const nameVal = cells[3];
          const descVal = cells[4];
          const exampleVal = cells[5];
          const keywordsVal = cells[6] || "";
          const enabledVal = cells[7] === undefined || cells[7].toLowerCase() === "true" || cells[7] === "1" || cells[7] === "y";

          let targetKey: keyof CapabilityDatabase | null = null;
          if (codeVal.startsWith('SN')) targetKey = 'SN';
          else if (codeVal.startsWith('MP')) targetKey = 'MP';
          else if (codeVal.startsWith('PJ')) targetKey = 'PJ';
          else if (codeVal.startsWith('SP')) targetKey = 'SP';

          if (!targetKey) continue;

          const newItem: CapabilityItem = {
            code: codeVal,
            grammar: categoryVal || (targetKey === 'SN' ? '센서(SN)' : targetKey === 'MP' ? '모션(MP)' : targetKey === 'PJ' ? '프로젝션(PJ)' : '스피커(SP)'),
            category: groupVal,
            name: nameVal,
            desc: descVal,
            example: exampleVal,
            keywords: keywordsVal,
            enabled: enabledVal
          };

          const existingIndex = dbCopy[targetKey].findIndex(item => item.code === codeVal);
          if (existingIndex > -1) {
            dbCopy[targetKey][existingIndex] = newItem;
            updatedCount++;
          } else {
            dbCopy[targetKey].push(newItem);
            addedCount++;
          }
        }

        // Sort arrays
        dbCopy.SN.sort((a, b) => a.code.localeCompare(b.code));
        dbCopy.MP.sort((a, b) => a.code.localeCompare(b.code));
        dbCopy.PJ.sort((a, b) => a.code.localeCompare(b.code));
        dbCopy.SP.sort((a, b) => a.code.localeCompare(b.code));

        // Save back to server
        const saveRes = await fetch('/api/database', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dbCopy)
        });

        if (!saveRes.ok) throw new Error("서버 저장 중 오류 발생");

        setDatabase(dbCopy);
        alert(`CSV 업로드 성공!\n새로운 캐퍼빌리티 ${addedCount}건 추가, ${updatedCount}건 정보 갱신 완료.`);
      } catch (err: any) {
        console.error(err);
        alert(`CSV 파싱 오류: ${err.message}`);
      }
    };
    reader.readAsText(file, 'utf-8');
  };

  return (
    <div class="app-layout">
      {/* Header & Main Views navigation */}
      <header class="main-header" style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'stretch' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1>PUCO Grammar Console</h1>
          <div class="status-tag">
            <span style={{ marginRight: '6px', color: '#1463ff' }}>●</span>
            데이터베이스: {database ? `${database.SN.length + database.MP.length + database.PJ.length + database.SP.length}개 항목 로드 완료` : '로딩 중...'}
          </div>
        </div>
        
        {/* Navigation Tabs (Samsung One UI) */}
        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-light)', paddingBottom: '8px', flexWrap: 'wrap' }}>
          <button 
            className={`db-tab-btn ${currentView === 'console' ? 'active' : ''}`}
            onClick={() => setCurrentView('console')}
            style={{ borderRadius: '18px', padding: '10px 22px', fontSize: '13.5px' }}
          >
            <i class="fa-solid fa-microchip" style={{ marginRight: '8px' }}></i>
            분석 콘솔
          </button>
          <button 
            className={`db-tab-btn ${currentView === 'saved' ? 'active' : ''}`}
            onClick={() => setCurrentView('saved')}
            style={{ borderRadius: '18px', padding: '10px 22px', fontSize: '13.5px' }}
          >
            <i class="fa-solid fa-bookmark" style={{ marginRight: '8px' }}></i>
            저장된 시나리오
            {savedScenarios.length > 0 && (
              <span style={{ 
                marginLeft: '8px', 
                background: currentView === 'saved' ? '#ffffff' : 'var(--primary-color)',
                color: currentView === 'saved' ? 'var(--primary-color)' : '#ffffff',
                padding: '2px 8px',
                borderRadius: '10px',
                fontSize: '11px',
                fontWeight: 700
              }}>
                {savedScenarios.length}
              </span>
            )}
          </button>
          <button 
            className={`db-tab-btn ${currentView === 'assets' ? 'active' : ''}`}
            onClick={() => setCurrentView('assets')}
            style={{ borderRadius: '18px', padding: '10px 22px', fontSize: '13.5px' }}
          >
            <i class="fa-solid fa-folder-open" style={{ marginRight: '8px' }}></i>
            데이터 에셋
          </button>
          <button 
            className={`db-tab-btn ${currentView === 'settings' ? 'active' : ''}`}
            onClick={() => setCurrentView('settings')}
            style={{ borderRadius: '18px', padding: '10px 22px', fontSize: '13.5px' }}
          >
            <i class="fa-solid fa-sliders" style={{ marginRight: '8px' }}></i>
            설정
          </button>
        </div>
      </header>

      {/* Main Views Router */}
      {currentView === 'console' && (
        <>
          {/* Input Section Card */}
          <section class="oneui-card">
            <div class="input-section">
              <div class="card-title">시나리오 입력</div>
              <div class="textarea-wrapper">
                <textarea
                  class="scenario-textarea"
                  placeholder="사용자가 [트리거]했을 때, 푸코가 [의도·감정]을 전달한다"
                  value={scenarioText}
                  onChange={(e) => setScenarioText(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div class="helper-text">
                <i class="fa-solid fa-circle-info"></i>
                트리거와 의도를 함께 구체적으로 써주시면 매칭 정확도가 한층 더 향상됩니다.
              </div>

              <div class="presets-row">
                {PRESET_SCENARIOS.map((preset, index) => (
                  <button
                    key={index}
                    class="preset-pill-btn"
                    onClick={() => {
                      setScenarioText(preset.text);
                      handleSynthesize(preset.text);
                    }}
                    disabled={loading}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <div class="btn-row">
                <button
                  class="btn-primary"
                  onClick={() => handleSynthesize()}
                  disabled={loading || !scenarioText.trim() || !database}
                >
                  {loading ? '매칭 중...' : '매칭 실행'}
                </button>
              </div>
            </div>
          </section>

          {/* Loading & Errors */}
          {loading && (
            <div class="oneui-card loader-wrapper">
              <div class="spinner"></div>
              <div class="loading-text">상황에 맞는 최적의 캐퍼빌리티를 매칭하고 있습니다...</div>
            </div>
          )}

          {error && (
            <div class="oneui-card error-card">
              <div style={{ fontWeight: 700, marginBottom: '4px' }}>매칭 실패</div>
              <p>{error}</p>
            </div>
          )}

          {/* Match Result Display */}
          {!loading && matchResult && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* Missing Intent Notification */}
              {matchResult.missingIntent && (
                <div class="alert-banner">
                  <i class="fa-solid fa-triangle-exclamation"></i>
                  <div>
                    <strong>상황 제안:</strong> {matchResult.intentNote}
                  </div>
                </div>
              )}

              {/* Combined Summary Card with Save Trigger */}
              <div class="oneui-card summary-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                  <div class="summary-title">전체 시나리오 요약</div>
                  <div class="summary-text">"{matchResult.summary}"</div>
                </div>
                <button 
                  class="btn-primary"
                  onClick={handleSaveScenario}
                  style={{ 
                    background: 'var(--primary-light)', 
                    color: 'var(--primary-color)',
                    boxShadow: 'none',
                    padding: '10px 20px',
                    borderRadius: '20px',
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <i class="fa-solid fa-bookmark"></i>
                  시나리오 저장
                </button>
              </div>

              {/* Capabilities Result Grid (Dynamically renders only active categories) */}
              {(() => {
                const activePanels = [];
                if ((matchResult.SN || []).length > 0) {
                  activePanels.push({ key: 'SN', name: '센서 감지', color: '#1463ff', badge: 'SN', list: matchResult.SN });
                }
                if ((matchResult.MP || []).length > 0) {
                  activePanels.push({ key: 'MP', name: '모션 반응', color: '#d500f9', badge: 'MP', list: matchResult.MP });
                }
                if ((matchResult.PJ || []).length > 0) {
                  activePanels.push({ key: 'PJ', name: '투사 반응', color: '#00c853', badge: 'PJ', list: matchResult.PJ });
                }
                if ((matchResult.SP || []).length > 0) {
                  activePanels.push({ key: 'SP', name: '음향 반응', color: '#ff4081', badge: 'SP', list: matchResult.SP });
                }

                if (activePanels.length === 0) {
                  return (
                    <div class="oneui-card" style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--text-sub)' }}>
                      <i class="fa-solid fa-circle-nodes" style={{ fontSize: '36px', color: 'var(--text-muted)', marginBottom: '16px', display: 'block' }}></i>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '6px' }}>
                        활성화된 캐퍼빌리티가 없습니다
                      </div>
                      <p style={{ fontSize: '13px' }}>
                        분석 결과 이 상황에서 매칭되는 필수 로봇 행동 조합이 없습니다. <br />
                        트리거나 로봇이 행해야 하는 반응을 문장으로 구체화해서 다시 실행해보세요.
                      </p>
                    </div>
                  );
                }

                return (
                  <div class="results-grid" style={{ 
                    display: 'grid', 
                    gridTemplateColumns: activePanels.length === 1 ? '1fr' : activePanels.length === 3 ? 'repeat(auto-fit, minmax(300px, 1fr))' : '1fr 1fr',
                    gap: '20px' 
                  }}>
                    {activePanels.map((panel) => (
                      <div key={panel.key} class="oneui-card" style={{ borderTop: `4px solid ${panel.color}` }}>
                        <div class="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>
                            {panel.name} <span class="code-font" style={{ color: panel.color }}>({panel.badge})</span>
                          </span>
                          <span class="panel-header-badge" style={{ background: `${panel.color}0a`, color: panel.color, border: `1px solid ${panel.color}1c` }}>
                            {panel.list.length}건 활성화
                          </span>
                        </div>
                        {panel.list.map((match) => {
                          const detail = getCapabilityDetail(match.code);
                          return (
                            <div key={match.code} class="subcard" style={{ borderLeft: `3px solid ${panel.color}` }}>
                              <div class="subcard-header">
                                <span class="code-pill" style={{ background: `${panel.color}0d`, color: panel.color, borderColor: `${panel.color}25` }}>{match.code}</span>
                                <span class="subcard-cat">{detail?.category || '기타'}</span>
                              </div>
                              <div class="subcard-name">{detail?.name || '정보 로딩 중...'}</div>
                              <div class="subcard-desc">{detail?.desc}</div>
                              <div class="subcard-reason-divider"></div>
                              <div class="subcard-reason">
                                <span style={{ color: panel.color, marginRight: '6px' }}>●</span>
                                {match.reason}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}
        </>
      )}

      {/* Saved Scenarios View */}
      {currentView === 'saved' && (
        <section class="oneui-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
            <div class="card-title" style={{ marginBottom: 0 }}>
              저장된 시나리오 목록
              <span class="panel-header-badge">{savedScenarios.length}건 저장됨</span>
            </div>
            
            <div class="search-input-wrapper">
              <i class="fa-solid fa-magnifying-glass"></i>
              <input 
                type="text" 
                placeholder="시나리오, 결과 요약, 코드 검색..."
                value={savedSearchQuery}
                onChange={(e) => setSavedSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {filteredSavedScenarios.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-sub)' }}>
              <i class="fa-regular fa-bookmark" style={{ fontSize: '32px', color: 'var(--text-muted)', marginBottom: '12px', display: 'block' }}></i>
              {savedScenarios.length === 0 ? '저장된 상황 시나리오가 없습니다. 분석 콘솔에서 시나리오를 만들고 저장해 보세요!' : '검색 결과와 일치하는 시나리오가 없습니다.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {filteredSavedScenarios.map((scenario) => (
                <div 
                  key={scenario.id} 
                  class="subcard" 
                  onClick={() => handleLoadScenario(scenario)}
                  style={{ 
                    cursor: 'pointer', 
                    padding: '24px', 
                    background: '#ffffff',
                    border: '1.5px solid var(--border-light)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px'
                  }}
                >
                  {/* Scenario Top info */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-main)' }}>
                      "{scenario.scenarioText}"
                    </div>
                    <div style={{ fontSize: '11.5px', color: 'var(--text-sub)', whiteSpace: 'nowrap' }}>
                      {scenario.timestamp}
                    </div>
                  </div>

                  {/* Summary Box */}
                  <div style={{ fontSize: '13.5px', color: 'var(--text-main)', background: 'var(--primary-light)', padding: '12px 16px', borderRadius: '14px', borderLeft: '4px solid var(--primary-color)', fontWeight: 500 }}>
                    <strong>요약:</strong> {scenario.result.summary}
                  </div>

                  {/* Matched Capabilities Details Expanded */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-sub)', textTransform: 'uppercase', borderBottom: '1px solid var(--border-light)', paddingBottom: '6px' }}>
                      활성화 캐퍼빌리티 연동 정보
                    </div>
                    
                    {/* Render detailed details for each matched code */}
                    {[
                      { list: scenario.result.SN, label: "센서(SN)", color: 'var(--primary-color)', bg: 'var(--primary-light)' },
                      { list: scenario.result.MP, label: "모션(MP)", color: '#d500f9', bg: 'rgba(213, 0, 249, 0.06)' },
                      { list: scenario.result.PJ, label: "투사(PJ)", color: '#00c853', bg: 'rgba(0, 200, 83, 0.06)' },
                      { list: scenario.result.SP, label: "음향(SP)", color: '#ff4081', bg: 'rgba(255, 64, 129, 0.06)' }
                    ].map((catGroup) => {
                      if (!catGroup.list || catGroup.list.length === 0) return null;
                      return catGroup.list.map((matchedItem) => {
                        const detail = getCapabilityDetail(matchedItem.code);
                        return (
                          <div key={matchedItem.code} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', fontSize: '13px' }}>
                            {/* Code Pill */}
                            <span class="code-font" style={{ 
                              background: catGroup.bg, 
                              color: catGroup.color, 
                              padding: '2px 8px', 
                              borderRadius: '6px', 
                              fontSize: '11px',
                              fontWeight: 700,
                              minWidth: '70px',
                              textAlign: 'center',
                              border: `1px solid ${catGroup.color}1e`
                            }}>
                              {matchedItem.code}
                            </span>
                            
                            {/* Name & Desc & Reason details */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <div>
                                <strong style={{ color: 'var(--text-main)' }}>{detail?.name || '정보를 조회할 수 없습니다.'}</strong>
                                <span style={{ color: 'var(--text-sub)', fontSize: '11.5px', marginLeft: '6px' }}>({detail?.category})</span>
                              </div>
                              <div style={{ color: 'var(--text-sub)', fontSize: '12px', lineHeight: 1.4 }}>
                                {detail?.desc}
                              </div>
                              <div style={{ color: 'var(--text-main)', fontSize: '12.5px', marginTop: '2px', fontStyle: 'italic' }}>
                                <i class="fa-solid fa-quote-left" style={{ fontSize: '10px', color: catGroup.color, marginRight: '4px' }}></i>
                                {matchedItem.reason}
                              </div>
                            </div>
                          </div>
                        );
                      });
                    })}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px', borderTop: '1px solid #f2f2f7', paddingTop: '12px' }}>
                    <button 
                      class="btn-primary"
                      onClick={() => handleLoadScenario(scenario)}
                      style={{ 
                        padding: '8px 16px', 
                        borderRadius: '16px', 
                        fontSize: '12px', 
                        background: 'var(--primary-light)', 
                        color: 'var(--primary-color)',
                        boxShadow: 'none'
                      }}
                    >
                      <i class="fa-solid fa-folder-open" style={{ marginRight: '6px' }}></i>
                      콘솔로 불러오기
                    </button>
                    <button 
                      class="btn-primary"
                      onClick={(e) => handleDeleteScenario(scenario.id, e)}
                      style={{ 
                        padding: '8px 16px', 
                        borderRadius: '16px', 
                        fontSize: '12px', 
                        background: 'rgba(255, 59, 48, 0.08)', 
                        color: '#ff3b30',
                        boxShadow: 'none'
                      }}
                    >
                      <i class="fa-solid fa-trash-can" style={{ marginRight: '6px' }}></i>
                      삭제
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Data Assets (데이터 에셋) Page Tab */}
      {currentView === 'assets' && (
        <section class="oneui-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
            <div class="card-title" style={{ marginBottom: 0 }}>
              캐퍼빌리티 데이터셋 사전
            </div>
            
            {/* CRUD and CSV Buttons */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button 
                class="btn-primary" 
                onClick={handleOpenAddModal}
                style={{ padding: '8px 18px', borderRadius: '18px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <i class="fa-solid fa-plus"></i>
                Add Capability
              </button>
              
              <button 
                class="btn-primary"
                onClick={() => fileInputRef.current?.click()}
                style={{ padding: '8px 18px', borderRadius: '18px', fontSize: '13px', background: '#e5e5ea', color: 'var(--text-main)', boxShadow: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <i class="fa-solid fa-file-csv"></i>
                CSV Upload
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleCSVUpload} 
                accept=".csv" 
                style={{ display: 'none' }} 
              />
            </div>
          </div>

          {/* Filters by Category */}
          <div class="db-tabs">
            {(['All', 'SN', 'MP', 'PJ', 'SP'] as const).map((tab) => (
              <button 
                key={tab}
                class={`db-tab-btn ${activeTab === tab ? 'active' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab === 'All' ? 'All (전체)' : tab === 'SN' ? 'Sensor (SN)' : tab === 'MP' ? 'Motion (MP)' : tab === 'PJ' ? 'Projection (PJ)' : 'Speaker (SP)'}
              </button>
            ))}
          </div>

          {/* Database Search Filter */}
          <div class="db-controls">
            <div class="search-input-wrapper">
              <i class="fa-solid fa-magnifying-glass"></i>
              <input 
                type="text" 
                placeholder="코드, 캐퍼빌리티 이름, 키워드 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Table View */}
          <div class="db-table-wrapper">
            <table class="db-table">
              <thead>
                <tr>
                  <th class="col-code">Code</th>
                  <th>Category</th>
                  <th>Group</th>
                  <th class="col-name">Capability Name</th>
                  <th>Description</th>
                  <th>Example</th>
                  <th>Keywords</th>
                  <th style={{ width: '80px', textAlign: 'center' }}>Enabled</th>
                  <th style={{ width: '100px', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {database ? (
                  filteredDatabaseItems.length > 0 ? (
                    filteredDatabaseItems.map((item) => (
                      <tr key={item.code} style={{ opacity: item.enabled === false ? 0.5 : 1 }}>
                        <td class="col-code">{item.code}</td>
                        <td style={{ color: '#86868b', fontSize: '12px' }}>{item.grammar}</td>
                        <td style={{ color: '#86868b', fontSize: '12px' }}>{item.category}</td>
                        <td class="col-name">{item.name}</td>
                        <td>{item.desc}</td>
                        <td style={{ color: '#86868b' }}>{item.example}</td>
                        <td style={{ color: 'var(--primary-color)', fontSize: '12px' }}>{item.keywords}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ 
                            display: 'inline-block',
                            width: '10px',
                            height: '10px',
                            borderRadius: '50%',
                            background: item.enabled !== false ? '#00c853' : '#ff3b30'
                          }} />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                            <button 
                              onClick={() => handleOpenEditModal(item)}
                              style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--primary-color)', padding: '4px' }}
                            >
                              <i class="fa-solid fa-pen-to-square"></i>
                            </button>
                            <button 
                              onClick={(e) => handleDeleteCapability(item, e)}
                              style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#ff3b30', padding: '4px' }}
                            >
                              <i class="fa-solid fa-trash-can"></i>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colspan={9} style={{ textAlign: 'center', color: '#86868b', padding: '30px' }}>
                        검색 결과 항목이 없습니다.
                      </td>
                    </tr>
                  )
                ) : (
                  <tr>
                    <td colspan={9} style={{ textAlign: 'center', color: '#86868b', padding: '30px' }}>
                      데이터베이스 로딩 중...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Settings (설정) Page Tab */}
      {currentView === 'settings' && (
        <section class="oneui-card" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div>
            <div class="card-title" style={{ marginBottom: '4px' }}>AI 추천 환경설정</div>
            <p style={{ fontSize: '13px', color: 'var(--text-sub)' }}>AI 가 매치 코드를 추천할 때 사용할 필터 가이드라인 및 서버사이드 규칙 기준을 커스텀 조율합니다.</p>
          </div>

          {/* 1. Selection Mode Option Cards */}
          <div>
            <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '12px' }}>
              Selection Mode (추천 코드 수량 밀도)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
              {[
                { key: 'essential', title: "Essential only", desc: "상황 수행에 반드시 필요한 최소 핵심 코드만 1건 선별합니다." },
                { key: 'balanced', title: "Balanced", desc: "주 상황 맥락에 고르게 어울리는 핵심 연관 코드들을 추천합니다." },
                { key: 'detailed', title: "Detailed", desc: "조금이라도 기능 가능성이 있는 후보 코드를 다양하게 픽합니다." }
              ].map((opt) => (
                <div 
                  key={opt.key}
                  className={`setting-option-card ${selectionMode === opt.key ? 'active' : ''}`}
                  onClick={() => {
                    setSelectionMode(opt.key as any);
                    saveSetting('puko_settings_selectionMode', opt.key);
                  }}
                >
                  <div class="setting-option-card-title">{opt.title}</div>
                  <div class="setting-option-card-desc">{opt.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 2. Code validation checkboxes */}
          <div>
            <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '12px' }}>
              Code Validation (검증 및 필터링 규칙)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[
                { 
                  state: validationRemoveNonExistent, 
                  setter: setValidationRemoveNonExistent, 
                  key: 'puko_settings_valRemoveNonExistent', 
                  label: "데이터셋에 존재하지 않는 코드 제거",
                  desc: "Claude가 생성한 코드 중, 사전 리스트에 존재하지 않는 코드는 클라이언트에 보내기 전 강제로 필터 아웃합니다."
                },
                { 
                  state: validationRemoveDuplicates, 
                  setter: setValidationRemoveDuplicates, 
                  key: 'puko_settings_valRemoveDuplicates', 
                  label: "중복 코드 추천 제거",
                  desc: "동일 코드 항목이 한 결과 안에 여러 번 포함되어 있을 경우 1건만 남기도록 정제합니다."
                },
                { 
                  state: validationVerifyName, 
                  setter: setValidationVerifyName, 
                  key: 'puko_settings_valVerifyName', 
                  label: "코드와 기능명 일치 여부 확인 (사전 보정)",
                  desc: "매칭된 코드의 기능 이름 데이터를 로컬 데이터베이스의 공식 데이터셋 이름으로 매칭 보정합니다."
                },
                { 
                  state: validationPreventFuzzyDuplicates, 
                  setter: setValidationPreventFuzzyDuplicates, 
                  key: 'puko_settings_valPreventFuzzy', 
                  label: "비슷한 기능의 불필요한 중복 선택 방지",
                  desc: "성격이 겹치는 센서/모션 코드(예: 근접 및 속도 센서 등)는 가장 유사도가 높은 핵심 1건만 압축하도록 제한합니다."
                },
                { 
                  state: validationPreventMutation, 
                  setter: setValidationPreventMutation, 
                  key: 'puko_settings_valPreventMutation', 
                  label: "기존 코드 문자와 숫자 변경 금지 (엄격 포맷 확인)",
                  desc: "SN-C02 등 사소한 규격 변경이나 타이포 돌발 생성을 방지하고, DB에 기입된 정확한 Hyphen 규격만을 허용합니다."
                }
              ].map((valCheck, index) => (
                <label 
                  key={index} 
                  className="setting-checkbox-row"
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span class="setting-checkbox-label">{valCheck.label}</span>
                    <span style={{ fontSize: '11.5px', color: 'var(--text-sub)' }}>{valCheck.desc}</span>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={valCheck.state}
                    onChange={(e) => {
                      valCheck.setter(e.target.checked);
                      saveSetting(valCheck.key, e.target.checked);
                    }}
                  />
                </label>
              ))}
            </div>
          </div>

          {/* 3. Output Language selections */}
          <div>
            <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '12px' }}>
              Output Language (출력 결과 언어)
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              {[
                { key: 'ko', label: "Korean (한국어 기본)" },
                { key: 'en', label: "English (영어 출력)" }
              ].map((lang) => (
                <label 
                  key={lang.key}
                  className={`setting-checkbox-row ${outputLanguage === lang.key ? 'active' : ''}`}
                  style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  onClick={() => {
                    setOutputLanguage(lang.key as any);
                    saveSetting('puko_settings_outputLanguage', lang.key);
                  }}
                >
                  <span class="setting-checkbox-label">{lang.label}</span>
                  <input 
                    type="radio" 
                    name="outputLanguage"
                    checked={outputLanguage === lang.key}
                    onChange={() => {}}
                    style={{ width: '18px', height: '18px', accentColor: 'var(--primary-color)' }}
                  />
                </label>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Add / Edit Capability Overlay Dialog Modal */}
      {showAddEditModal && (
        <div class="modal-overlay" onClick={() => setShowAddEditModal(false)}>
          <div class="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-light)', paddingBottom: '12px' }}>
              <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-main)' }}>
                {editingItem ? '캐퍼빌리티 정보 편집' : '새 캐퍼빌리티 등록'}
              </div>
              <button 
                onClick={() => setShowAddEditModal(false)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '16px', color: 'var(--text-sub)' }}
              >
                <i class="fa-solid fa-xmark"></i>
              </button>
            </div>

            <form onSubmit={handleSaveCapability} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Category selector */}
              <div class="form-row">
                <div class="form-group">
                  <label>분류 (Category)</label>
                  <select 
                    class="form-control"
                    value={formGrammar}
                    onChange={(e) => {
                      setFormGrammar(e.target.value);
                      if (e.target.value === '센서(SN)' && !formCode.startsWith('SN')) setFormCode("SN-");
                      else if (e.target.value === '모션(MP)' && !formCode.startsWith('MP')) setFormCode("MP-");
                      else if (e.target.value === '프로젝션(PJ)' && !formCode.startsWith('PJ')) setFormCode("PJ-");
                      else if (e.target.value === '스피커(SP)' && !formCode.startsWith('SP')) setFormCode("SP-");
                    }}
                  >
                    <option value="센서(SN)">센서 (SN)</option>
                    <option value="모션(MP)">모션 (MP)</option>
                    <option value="프로젝션(PJ)">프로젝션 (PJ)</option>
                    <option value="스피커(SP)">스피커 (SP)</option>
                  </select>
                </div>
                
                {/* Code Field */}
                <div class="form-group">
                  <label>식별 코드 (Code)</label>
                  <input 
                    type="text" 
                    class="form-control"
                    placeholder="예: SN-A-04 또는 MP-A06"
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value)}
                    disabled={!!editingItem} // Code string cannot be modified if editing existing row
                  />
                </div>
              </div>

              {/* Group Name (e.g. A ToF 센서) */}
              <div class="form-group">
                <label>중분류 그룹 (Group)</label>
                <input 
                  type="text" 
                  class="form-control"
                  placeholder="예: A ToF 센서, J 복합 연속 모션 등"
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                />
              </div>

              {/* Name */}
              <div class="form-group">
                <label>캐퍼빌리티 이름 (Capability name)</label>
                <input 
                  type="text" 
                  class="form-control"
                  placeholder="기능 한줄 이름을 적어주세요"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
              </div>

              {/* Description */}
              <div class="form-group">
                <label>상세 설명 (Description)</label>
                <textarea 
                  class="form-control"
                  style={{ height: '70px', resize: 'none' }}
                  placeholder="기능의 원리 및 자세한 감지/동작 동작 설명을 입력하세요"
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                />
              </div>

              {/* Example */}
              <div class="form-group">
                <label>적용 목적 및 예시 (Example)</label>
                <input 
                  type="text" 
                  class="form-control"
                  placeholder="예: 대기→활성 전환, 인사, 완료 알림"
                  value={formExample}
                  onChange={(e) => setFormExample(e.target.value)}
                />
              </div>

              {/* Keywords */}
              <div class="form-group">
                <label>유사 매핑 키워드 (Keywords)</label>
                <input 
                  type="text" 
                  class="form-control"
                  placeholder="쉼표로 구분 예: 필드, 넘겨줘, 스와이프"
                  value={formKeywords}
                  onChange={(e) => setFormKeywords(e.target.value)}
                />
              </div>

              {/* Enabled toggle */}
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: '4px 0' }}>
                <input 
                  type="checkbox" 
                  checked={formEnabled}
                  onChange={(e) => setFormEnabled(e.target.checked)}
                  style={{ width: '18px', height: '18px', accentColor: 'var(--primary-color)' }}
                />
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>
                  기능 활성화 (Enabled) - 해제 시 AI 분석 매칭 추천에서 제외됩니다.
                </span>
              </label>

              {/* Save footer */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid var(--border-light)', paddingTop: '14px', marginTop: '4px' }}>
                <button 
                  type="button"
                  class="btn-primary"
                  onClick={() => setShowAddEditModal(false)}
                  style={{ background: '#e5e5ea', color: 'var(--text-main)', boxShadow: 'none' }}
                >
                  취소
                </button>
                <button 
                  type="submit"
                  class="btn-primary"
                >
                  저장 반영
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
