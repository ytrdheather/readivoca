const API_URL = 'http://localhost:3000';

window.onload = function() {
    // 날짜 입력창에 오늘 날짜 기본 세팅
    document.getElementById('dash-date').valueAsDate = new Date();
    
    // 데이터 불러오기 시작
    loadStudents();  // 학생 목록
    loadDashboard(); // 학습 현황
    loadBooks();     // 교재 목록 (인쇄 센터용)
    
    // 실시간 요청 확인 (3초마다)
    loadRequests();
    setInterval(loadRequests, 3000);
};

function switchTab(tabId, btnElement) {
    // 탭 내용 숨기기/보이기
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    
    document.getElementById(tabId).classList.add('active');
    
    // 버튼 스타일 활성화
    if (btnElement) {
        btnElement.classList.add('active');
    } else {
        // 버튼을 직접 안 누르고 코드로 이동했을 때 처리
        const targetBtn = Array.from(document.querySelectorAll('.tab-btn')).find(btn => btn.textContent.includes(tabId.substr(-1)));
        if(targetBtn) targetBtn.classList.add('active');
    }

    // 탭 이동 시 데이터 새로고침
    if (tabId === 'tab-2') loadDashboard();
    if (tabId === 'tab-1') loadStudents();
}

function logout() { window.location.href = 'index.html'; }

// --- 1. 학생 관리 (진짜 데이터 연동) ---
async function loadStudents() {
    const tbody = document.getElementById('student-list-body');
    tbody.innerHTML = '<tr><td colspan="4">데이터를 불러오는 중...</td></tr>';

    try {
        const res = await fetch(`${API_URL}/admin/students`);
        const students = await res.json();
        
        tbody.innerHTML = ''; // 초기화

        if (!students || students.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4">등록된 학생이 없습니다.</td></tr>';
            return;
        }

        students.forEach(s => {
            tbody.innerHTML += `
                <tr>
                    <td>${s.username}</td>
                    <td><b>${s.name}</b></td>
                    <td>${s.assigned_book || '<span style="color:#ccc">미지정</span>'}</td>
                    <td>
                        <button class="btn-secondary" style="padding:4px 10px; font-size:0.8rem;" onclick="alert('학생 정보 수정 기능은 준비 중입니다.')">관리</button>
                    </td>
                </tr>
            `;
        });
    } catch (e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="4" style="color:red;">데이터 로드 실패</td></tr>';
    }
}

// --- 2. 학습 현황판 (진짜 데이터 연동) ---
async function loadDashboard() {
    const date = document.getElementById('dash-date').value;
    const tbody = document.getElementById('dashboard-body');
    tbody.innerHTML = '<tr><td colspan="6">조회 중...</td></tr>';

    try {
        const res = await fetch(`${API_URL}/admin/dashboard?date=${date}`);
        const records = await res.json();
        
        tbody.innerHTML = ''; // 초기화
        
        if (!records || records.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="padding:20px;">해당 날짜의 학습 기록이 없습니다.</td></tr>';
            return;
        }

        records.forEach(r => {
            const time = new Date(r.when).toLocaleTimeString('ko-KR', {hour:'2-digit', minute:'2-digit'});
            
            // 점수 색상 처리
            let resultBadge = `<span style="color:${r.score>=70?'#28a745':'#dc3545'}; font-weight:bold;">${r.score}점</span>`;
            if (r.which.includes('game')) resultBadge = `<span style="color:#ff9800">${r.score}점 (게임)</span>`;
            
            // 학습 유형 한글 변환
            const typeName = translateType(r.which);

            tbody.innerHTML += `
                <tr>
                    <td>${time}</td>
                    <td><b>${r.who}</b></td>
                    <td>${r.what}</td>
                    <td><span class="badge ${r.which}">${typeName}</span></td>
                    <td>${resultBadge}</td>
                    <td style="font-size:0.85rem; color:#666; max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${r.wrong_words}">${r.wrong_words || '-'}</td>
                </tr>
            `;
        });
    } catch(e) { 
        console.error(e); 
        tbody.innerHTML = '<tr><td colspan="6">서버 연결 오류</td></tr>';
    }
}

function translateType(type) {
    const map = { 
        'flashcard':'📖 암기', 'spelling':'⌨️ 스펠링', 'quiz':'🔄 반복', 'test':'📝 테스트', 
        'game_memory':'🃏 카드', 'game_rain':'🌧️ 산성비', 'game_monster':'🐲 몬스터', 'game_monster_fail': '🐲 몬스터(패)'
    };
    return map[type] || type;
}

// --- 3. 단어 데이터 관리 ---

// CSV 양식 다운로드
function downloadTemplate() {
    // 엑셀에서 바로 열리도록 BOM 추가
    const csvContent = "\uFEFFbook_name,unit_name,word_no,english,meaning,antonyms,synonyms,example\n능률보카,Day 01,1,apple,사과,,fruit,I eat an apple";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "sample_voca.csv";
    link.click();
}

// CSV 파일 업로드
function uploadCSV() {
    const fileInput = document.getElementById('csv-file');
    const file = fileInput.files[0];
    if (!file) return alert("파일을 먼저 선택해주세요!");

    Papa.parse(file, {
        header: true, skipEmptyLines: true,
        complete: async function(results) {
            if (results.data.length === 0) return alert("데이터가 없는 파일입니다.");
            
            if (!confirm(`총 ${results.data.length}개의 단어를 업로드하시겠습니까?\n(기존 데이터에 추가됩니다)`)) return;
            
            try {
                const res = await fetch(`${API_URL}/admin/bulk-upload`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ words: results.data })
                });
                const result = await res.json();
                if (res.ok) alert(`✅ ${result.count}개 단어가 성공적으로 저장되었습니다!`);
                else alert("❌ 저장 실패: " + result.error);
            } catch (err) { alert("서버 오류 발생"); }
        }
    });
}

// 텍스트 간편 업로드
async function uploadManualText() {
    const bookName = document.getElementById('manual-book-name').value.trim();
    const unitName = document.getElementById('manual-unit-name').value.trim();
    const rawText = document.getElementById('manual-text-input').value.trim();

    if (!bookName || !unitName || !rawText) return alert("교재명, 유닛명, 단어 내용을 모두 입력해주세요!");

    const lines = rawText.split('\n');
    const parsedData = [];

    lines.forEach((line, index) => {
        line = line.trim();
        if (!line) return;
        // 탭이나 파이프로 분리
        let parts = line.split('\t');
        if (parts.length < 2 && line.includes('|')) parts = line.split('|');

        if (parts.length >= 2) {
            parsedData.push({
                book_name: bookName, unit_name: unitName, word_no: index + 1,
                english: parts[0].trim(), 
                meaning: parts[1].trim(),
                antonyms: parts[2] ? parts[2].trim() : null,
                synonyms: parts[3] ? parts[3].trim() : null,
                example: parts[4] ? parts[4].trim() : null
            });
        }
    });

    if (parsedData.length === 0) return alert("인식된 단어가 없습니다. 형식을 확인해주세요.");

    if (!confirm(`총 ${parsedData.length}개의 단어를 업로드하시겠습니까?`)) return;

    try {
        const res = await fetch(`${API_URL}/admin/bulk-upload`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ words: parsedData })
        });
        const result = await res.json();
        if (res.ok) { 
            alert(`✅ ${result.count}개 저장 완료!`); 
            document.getElementById('manual-text-input').value = ''; 
            searchWords(); // 검색 목록 갱신
        } 
        else alert("❌ 저장 실패: " + result.error);
    } catch (err) { alert("서버 오류"); }
}

// 단어 검색 및 수정
async function searchWords() {
    const k = document.getElementById('mgr-search-input').value;
    // 검색어 없어도 전체 조회 가능하게 하려면 아래 줄 주석 처리
    // if (!k) return alert("검색어를 입력하세요");

    const res = await fetch(`${API_URL}/admin/search?keyword=${encodeURIComponent(k)}`);
    const words = await res.json();
    const list = document.getElementById('mgr-result-list');
    list.innerHTML = '';
    
    if(words.length === 0) { list.innerHTML = '<div style="padding:20px; text-align:center;">검색 결과가 없습니다.</div>'; return; }
    
    words.forEach(w => {
        const div = document.createElement('div'); div.className='word-item';
        div.innerHTML = `
            <div style="display:flex; justify-content:space-between;">
                <span class="word-en">${w.english}</span>
                <span class="word-ko">${w.meaning}</span>
            </div>
            <div class="word-meta">${w.book_name} > ${w.unit_name}</div>
        `;
        div.onclick = () => openModal(w);
        list.appendChild(div);
    });
}

function openModal(w) {
    document.getElementById('edit-id').value = w.id;
    document.getElementById('edit-en').value = w.english;
    document.getElementById('edit-ko').value = w.meaning;
    document.getElementById('edit-ex').value = w.example || '';
    document.getElementById('edit-syn').value = w.synonyms || '';
    document.getElementById('edit-ant').value = w.antonyms || '';
    document.getElementById('edit-modal').style.display = 'flex';
}

async function saveWord() {
    const id = document.getElementById('edit-id').value;
    const body = { 
        id: id, 
        english: document.getElementById('edit-en').value, 
        meaning: document.getElementById('edit-ko').value, 
        example: document.getElementById('edit-ex').value, 
        synonyms: document.getElementById('edit-syn').value, 
        antonyms: document.getElementById('edit-ant').value 
    };
    
    const res = await fetch(`${API_URL}/admin/update-word`, { 
        method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) 
    });
    
    if(res.ok) { 
        alert("✅ 수정되었습니다!"); 
        document.getElementById('edit-modal').style.display='none'; 
        searchWords(); // 목록 갱신
    } else {
        alert("❌ 수정 실패");
    }
}

// --- 4. 스마트 인쇄 센터 (교재 불러오기 해결) ---
async function loadBooks() {
    try {
        const res = await fetch(`${API_URL}/books`);
        const data = await res.json();
        
        // 인쇄용 선택창
        const s = document.getElementById('print-book-select');
        s.innerHTML = '<option value="">📚 교재 선택</option>';
        data.forEach(b => s.innerHTML += `<option>${b}</option>`);

        // 선생님 대시보드 조회용 선택창
        const ts = document.getElementById('teacher-book-select');
        if(ts) {
            ts.innerHTML = '<option value="">전체 보기</option>';
            data.forEach(b => ts.innerHTML += `<option>${b}</option>`);
        }
    } catch(e) { console.error("책 목록 로드 실패:", e); }
}

async function loadPrintUnits() {
    const b = document.getElementById('print-book-select').value;
    const s = document.getElementById('print-unit-select');
    s.innerHTML = '<option>유닛 로딩중...</option>'; s.disabled=true;
    
    if(!b) { s.innerHTML='<option>유닛 선택</option>'; return; }

    const res = await fetch(`${API_URL}/units?book_name=${encodeURIComponent(b)}`);
    const data = await res.json();
    
    s.innerHTML = '<option>📂 유닛 선택</option>';
    data.forEach(u => s.innerHTML += `<option>${u}</option>`);
    s.disabled=false;
}

// 시험지 생성 로직
async function generatePrint(type) {
    const book = document.getElementById('print-book-select').value;
    const unit = document.getElementById('print-unit-select').value;
    if (book.includes('선택') || unit.includes('선택')) return alert("교재와 유닛을 먼저 선택해주세요.");

    const res = await fetch(`${API_URL}/start-learning`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ book_name: book, unit_name: unit }) });
    let words = await res.json();
    
    if(!words || words.length === 0) return alert("해당 유닛에 단어가 없습니다.");

    // 옵션 값 가져오기
    const totalCount = parseInt(document.getElementById('print-total-count').value) || 20;
    const rMean = parseInt(document.getElementById('ratio-meaning').value) || 0;
    const rSpell = parseInt(document.getElementById('ratio-spelling').value) || 0;
    const rEx = parseInt(document.getElementById('ratio-example').value) || 0;
    const rSyn = parseInt(document.getElementById('ratio-synant').value) || 0;

    // 단어 섞기
    words.sort(() => 0.5 - Math.random());
    
    // 문제 개수 계산
    const countMean = Math.floor(totalCount * (rMean / 100));
    const countSpell = Math.floor(totalCount * (rSpell / 100));
    const countEx = Math.floor(totalCount * (rEx / 100));
    const countSyn = totalCount - countMean - countSpell - countEx; // 나머지는 유의어로

    let questions = [];
    let cursor = 0;
    function getWord() { return words[(cursor++) % words.length]; } // 단어 모자르면 순환

    for(let i=0; i<countMean; i++) questions.push({ w: getWord(), type: 'meaning' });
    for(let i=0; i<countSpell; i++) questions.push({ w: getWord(), type: 'spelling' });
    for(let i=0; i<countEx; i++) questions.push({ w: getWord(), type: 'example' });
    for(let i=0; i<countSyn; i++) questions.push({ w: getWord(), type: 'synonym' });
    
    // 문제 순서 섞기
    questions.sort(() => 0.5 - Math.random());

    // 인쇄 화면 채우기
    const title = document.getElementById('print-title');
    const tbody = document.getElementById('print-tbody');
    tbody.innerHTML = '';

    if (type === 'test') {
        title.innerText = `${unit} - Vocabulary Test`;
        questions.forEach((q, i) => {
            let left = '', right = '____________________';
            if(q.type === 'meaning') left = `${i+1}. ${q.w.english}`; 
            else if(q.type === 'spelling') left = `${i+1}. ${q.w.meaning}`;
            else if(q.type === 'example') left = `${i+1}. ${q.w.example ? q.w.example.replace(new RegExp(q.w.english, 'gi'), '______') : q.w.meaning} (빈칸)`;
            else left = `${i+1}. ${q.w.synonyms || q.w.meaning} (유의어/뜻)`;
            tbody.innerHTML += `<tr><td class="print-col-left">${left}</td><td class="print-col-right">${right}</td></tr>`;
        });
    } else if (type === 'answer') {
        title.innerText = `${unit} - Answer Key`;
        questions.forEach((q, i) => {
            let answer = q.type === 'meaning' ? q.w.meaning : q.w.english;
            tbody.innerHTML += `<tr><td class="print-col-left">${i+1}. (${q.type})</td><td class="print-col-right" style="color:red; font-weight:bold;">${answer}</td></tr>`;
        });
    } else {
        // 워크북
        title.innerText = `${unit} - Workbook`;
        words.forEach((w, i) => {
            tbody.innerHTML += `
                <tr>
                    <td class="print-col-left" style="font-size:14pt;">${i+1}. ${w.english}</td>
                    <td class="print-col-right">
                        <div>뜻: <span style="color:#ccc;">${w.meaning}</span></div>
                        <div style="margin-top:5px; font-size:0.9rem; color:#555;">Ex: ${w.example || '-'}</div>
                        <div style="margin-top:20px; border-bottom:1px solid #ddd;">&nbsp;</div>
                    </td>
                </tr>
            `;
        });
    }
    window.print();
}

// --- 실시간 요청 (대기열) ---
async function loadRequests() {
    try {
        const res = await fetch(`${API_URL}/admin/test-requests`);
        const requests = await res.json();
        const box = document.getElementById('request-queue-box');
        const list = document.getElementById('request-list');
        
        if (requests.length > 0) {
            box.style.display = 'block';
            list.innerHTML = '';
            requests.forEach(r => {
                const time = new Date(r.created_at).toLocaleTimeString();
                list.innerHTML += `
                    <div class="req-card">
                        <span>🔔 <b>${r.student_name}</b> 학생이 <b>[${r.book_name} - ${r.unit_name}]</b> 시험을 요청했습니다.</span>
                        <button class="btn-primary" style="margin:0; padding:5px 15px; font-size:0.8rem;" onclick="approveTest(${r.id})">승인</button>
                    </div>
                `;
            });
        } else {
            box.style.display = 'none';
        }
    } catch(e) {}
}

async function approveTest(id) {
    if(!confirm("시험을 승인하시겠습니까?")) return;
    await fetch(`${API_URL}/admin/approve-test`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ request_id: id })
    });
    loadRequests(); 
    alert("승인되었습니다!");
}