const API_URL = 'http://localhost:3000';
let availableBooks = [];

window.onload = function() {
    setPeriod('today'); 
    loadBooks().then(() => {
        loadStudents();
    });
};

function switchTab(tabId, btn) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    if(btn) btn.classList.add('active');
    
    if (tabId === 'tab-2') loadDashboard();
    if (tabId === 'tab-1') loadStudents();
}

function logout() { window.location.href = 'index.html'; }

// --- 날짜 필터 ---
function setPeriod(type, btn) {
    if(btn) {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    }
    const end = new Date(); const start = new Date();
    
    if(type === 'week') start.setDate(end.getDate() - 7);
    else if(type === '2weeks') start.setDate(end.getDate() - 14); 
    else if(type === 'month') start.setMonth(end.getMonth() - 1);
    
    const formatDate = (d) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    document.getElementById('dash-date-end').value = formatDate(end);
    document.getElementById('dash-date-start').value = formatDate(start);
    
    loadDashboard(); 
}

// --- 1. 학생 관리 (노션 연동 + 3개 교재 관리) ---
async function loadStudents() {
    const tbody = document.getElementById('student-list-body');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">데이터 불러오는 중...</td></tr>';
    
    try {
        const res = await fetch(`${API_URL}/admin/students`);
        const students = await res.json();
        tbody.innerHTML = '';
        
        if (!students || !Array.isArray(students) || students.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">등록된 학생이 없습니다.</td></tr>';
            return;
        }

        students.forEach(s => {
            const createSelect = (slotNum, currentVal) => {
                let opts = `<option value="">(선택 안 함)</option>`;
                availableBooks.forEach(book => {
                    const selected = book === currentVal ? 'selected' : '';
                    opts += `<option value="${book}" ${selected}>${book}</option>`;
                });
                return `<select id="book-${slotNum}-${s.pageId}" style="width:100%; padding:8px; font-size:0.9rem;">${opts}</select>`;
            };

            tbody.innerHTML += `
                <tr id="row-${s.pageId}">
                    <td><b>${s.name}</b></td>
                    <td style="color:#666;">${s.username}</td>
                    <td>${createSelect(1, s.book1)}</td>
                    <td>${createSelect(2, s.book2)}</td>
                    <td>${createSelect(3, s.book3)}</td>
                    <td>
                        <button class="btn-primary" style="margin:0; padding:6px 12px; font-size:0.85rem;" 
                                onclick="updateStudentBooks('${s.pageId}')">변경 저장</button>
                    </td>
                </tr>
            `;
        });
    } catch (e) { console.error(e); }
}

async function updateStudentBooks(pageId) {
    const book1 = document.getElementById(`book-1-${pageId}`).value;
    const book2 = document.getElementById(`book-2-${pageId}`).value;
    const book3 = document.getElementById(`book-3-${pageId}`).value;

    if(!confirm("이 학생의 교재 정보를 노션에 저장하시겠습니까?")) return;

    try {
        const res = await fetch(`${API_URL}/admin/update-student`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ pageId, book1, book2, book3 })
        });
        
        if(res.ok) {
            alert("✅ 저장 완료! 노션에 반영되었습니다.");
        } else {
            alert("❌ 저장 실패. 서버 로그를 확인하세요.");
        }
    } catch (e) {
        alert("서버 오류 발생");
    }
}

// --- 2. 학습 현황 (대시보드) ---
async function loadDashboard() {
    const start = document.getElementById('dash-date-start').value;
    const end = document.getElementById('dash-date-end').value;
    const tbody = document.getElementById('dashboard-body');
    
    const refreshBtn = document.querySelector('.refresh-btn i');
    if(refreshBtn) refreshBtn.classList.add('fa-spin');

    try {
        let records = [];
        try {
            const resRecords = await fetch(`${API_URL}/admin/dashboard?start=${start}&end=${end}`);
            if (resRecords.ok) records = await resRecords.json();
        } catch (err) { console.error("기록 로딩 실패:", err); }

        let pendingRequests = [];
        try {
            const resRequests = await fetch(`${API_URL}/admin/test-requests`);
            if (resRequests.ok) {
                const data = await resRequests.json();
                if (Array.isArray(data)) pendingRequests = data;
            }
        } catch (err) { console.error("요청 로딩 실패:", err); }

        const requestMap = {};
        if (Array.isArray(pendingRequests)) {
            pendingRequests.forEach(req => {
                requestMap[`${req.student_name}_${req.book_name}_${req.unit_name}`] = req.id;
            });
        }

        tbody.innerHTML = '';
        
        if (!records || !Array.isArray(records) || records.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:30px; color:#999;">해당 기간의 학습 기록이 없습니다.</td></tr>';
            if(refreshBtn) setTimeout(() => refreshBtn.classList.remove('fa-spin'), 500);
            return;
        }

        const grouped = {};
        records.forEach(r => {
            const dateKey = r.when.split('T')[0];
            const key = `${r.who}_${r.what}_${dateKey}`;
            
            if(!grouped[key]) {
                grouped[key] = { who: r.who, what: r.what, date: r.when, badges: {}, scores: {}, finalScore: '-', book: '', unit: '' };
                const splitIdx = r.what.lastIndexOf(' - ');
                if (splitIdx > -1) {
                    grouped[key].book = r.what.substring(0, splitIdx);
                    grouped[key].unit = r.what.substring(splitIdx + 3);
                }
            }
            
            const typeMap = { 'flashcard':1, 'game_memory':2, 'quiz':3, 'game_rain':4, 'spelling':5, 'game_monster':6, 'test':7 };
            const stage = typeMap[r.which];
            if(stage) {
                grouped[key].badges[stage] = true;
                const currentScore = grouped[key].scores[stage] || 0;
                if (r.score > currentScore) {
                    grouped[key].scores[stage] = r.score;
                }
            }
            if(r.which === 'test') grouped[key].finalScore = r.score;
        });

        Object.values(grouped).forEach(item => {
            const dateStr = new Date(item.date).toLocaleDateString();
            
            let badgeHtml = '<div class="progress-badges">';
            for(let i=1; i<=7; i++) {
                const isDone = item.badges[i];
                const score = item.scores[i] || 0;
                const className = isDone ? (i%2===0 ? 'p-badge game' : 'p-badge done') : 'p-badge';
                
                badgeHtml += `
                    <div style="display:flex; flex-direction:column; align-items:center; margin-right:4px;">
                        <div class="${className}">${i}</div>
                        ${isDone ? `<span style="font-size:10px; color:#32bfb6; font-weight:bold; margin-top:2px;">${score}</span>` : '<span style="height:14px; display:block;"></span>'}
                    </div>`;
            }
            badgeHtml += '</div>';

            let summaryTag = '';
            if (item.finalScore !== '-') {
                summaryTag = `<span class="score-tag ${item.finalScore >= 90 ? 'high' : ''}" style="margin-top:5px;">Final: ${item.finalScore}</span>`;
            }

            const reqKey = `${item.who}_${item.book}_${item.unit}`;
            const pendingId = requestMap[reqKey];
            
            let btnHtml = '';
            if (pendingId) {
                btnHtml = `<button class="status-btn pending" onclick="approveTestInTable(this, ${pendingId})">승인 요청</button>`;
            } else if (item.finalScore !== '-') {
                btnHtml = `<button class="status-btn approved">승인 완료</button>`;
            } else {
                btnHtml = `<button class="status-btn none">준비</button>`;
            }

            tbody.innerHTML += `
                <tr>
                    <td><b>${item.who}</b></td>
                    <td>${item.what}</td>
                    <td style="color:#666;">${dateStr}</td>
                    <td>
                        <div class="progress-container">
                            ${badgeHtml}
                            ${summaryTag}
                        </div>
                    </td>
                    <td>${btnHtml}</td>
                </tr>
            `;
        });
    } catch(e) { console.error(e); }
    
    if(refreshBtn) setTimeout(() => refreshBtn.classList.remove('fa-spin'), 500);
}

async function approveTestInTable(btnElement, requestId) {
    if(!confirm("시험을 승인하시겠습니까?")) return;
    try {
        const res = await fetch(`${API_URL}/admin/approve-test`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({request_id: requestId})
        });
        if(res.ok) {
            btnElement.className = 'status-btn approved';
            btnElement.innerText = '승인 완료';
            btnElement.onclick = null;
            alert("승인되었습니다!");
        } else alert("오류가 발생했습니다.");
    } catch(e) { alert("서버 통신 오류"); }
}

async function uploadManualText() {
    const book = document.getElementById('manual-book-name').value.trim();
    const unit = document.getElementById('manual-unit-name').value.trim();
    const text = document.getElementById('manual-text-input').value.trim();
    if(!book || !unit || !text) return alert("모두 입력하세요");

    const lines = text.split('\n');
    const parsed = [];
    lines.forEach((l, i) => {
        l = l.trim(); if(!l) return;
        let p = l.split('\t'); if(p.length<2 && l.includes('|')) p=l.split('|');
        if(p.length>=2) parsed.push({ book_name:book, unit_name:unit, word_no:i+1, english:p[0].trim(), meaning:p[1].trim(), antonyms:p[2]?.trim(), synonyms:p[3]?.trim(), example:p[4]?.trim() });
    });

    if(confirm(`${parsed.length}개 업로드?`)) {
        await fetch(`${API_URL}/admin/bulk-upload`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({words:parsed}) });
        alert("완료!");
        loadBooks(); // 책 목록 갱신
    }
}
function downloadTemplate() {
    const csvContent = "\uFEFFbook_name,unit_name,word_no,english,meaning,antonyms,synonyms,example\n능률보카,Day 01,1,apple,사과,,fruit,I eat an apple";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "sample.csv"; link.click();
}
function uploadCSV() {
    const file = document.getElementById('csv-file').files[0];
    if (!file) return alert("파일 선택!");
    Papa.parse(file, { header: true, skipEmptyLines: true, complete: async function(results) {
        if (!confirm(`총 ${results.data.length}개 업로드?`)) return;
        const res = await fetch(`${API_URL}/admin/bulk-upload`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ words: results.data }) });
        alert("완료!");
        loadBooks(); // 책 목록 갱신
    }});
}
async function loadPrintUnits() { 
    const b = document.getElementById('print-book-select').value;
    const s = document.getElementById('print-unit-select');
    const res = await fetch(`${API_URL}/units?book_name=${encodeURIComponent(b)}`);
    const data = await res.json();
    s.innerHTML = '<option>유닛 선택</option>'; data.forEach(u => s.innerHTML += `<option>${u}</option>`);
}
async function generatePrint(type) { 
    const book = document.getElementById('print-book-select').value;
    const unit = document.getElementById('print-unit-select').value;
    if (book.includes('선택') || unit.includes('선택')) return alert("선택하세요");
    
    const res = await fetch(`${API_URL}/start-learning`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({book_name:book, unit_name:unit}) });
    let words = await res.json();
    
    if(words.length === 0) return alert("단어 데이터가 없습니다.");
    
    const count = parseInt(document.getElementById('print-total-count').value) || 20;
    const rMeaning = parseInt(document.getElementById('ratio-meaning').value) || 40;
    const rSpelling = parseInt(document.getElementById('ratio-spelling').value) || 30;
    const rExample = parseInt(document.getElementById('ratio-example').value) || 20;
    const rSynAnt = parseInt(document.getElementById('ratio-synant').value) || 10;
    
    words.sort(() => Math.random() - 0.5);
    const selectedWords = words.slice(0, count);
    
    document.getElementById('print-area').style.display = 'block';
    const tbody = document.getElementById('print-tbody');
    tbody.innerHTML = '';
    
    const titles = { 'test': 'Vocabulary Test', 'workbook': 'Vocabulary Workbook', 'answer': 'Answer Key' };
    document.getElementById('print-title').innerText = `${titles[type]} - ${book} ${unit}`;
    
    selectedWords.forEach((w, i) => {
        let question = '', answer = w.english;
        let qType = 'meaning';
        
        const rand = Math.random() * 100;
        if(type === 'answer') {
            qType = 'answer';
        } else if (type === 'workbook') {
            qType = 'workbook';
        } else {
            if (rand < rMeaning) qType = 'meaning';
            else if (rand < rMeaning + rSpelling) qType = 'spelling';
            else if (rand < rMeaning + rSpelling + rExample) qType = 'example';
            else qType = 'synant';
        }
        
        if(qType === 'meaning') {
            question = `다음 뜻에 맞는 영어 단어를 쓰시오: <b>${w.meaning}</b>`;
        } else if(qType === 'spelling') {
            const hint = w.english.length > 2 ? w.english[0] + ' __ __ ' + w.english[w.english.length-1] : '__';
            question = `다음 뜻을 가진 단어의 스펠링을 완성하시오 (${hint}): <b>${w.meaning}</b>`;
        } else if(qType === 'example') {
            const ex = w.example ? w.example.replace(new RegExp(w.english, 'gi'), '_______') : `(예문 없음) ${w.meaning}`;
            question = `빈칸에 들어갈 단어는? : ${ex}`;
        } else if(qType === 'synant') {
            const t = w.synonyms ? `유의어: ${w.synonyms}` : (w.antonyms ? `반의어: ${w.antonyms}` : `뜻: ${w.meaning}`);
            question = `다음 단어와 관련된 단어를 쓰시오 (${t})`;
        } else if(qType === 'workbook') {
            question = `[ ] ${w.english}`;
            answer = `${w.meaning} / (예) ${w.example || ''}`;
        } else if(qType === 'answer') {
            question = `${i+1}. ${w.english}`;
            answer = `${w.meaning}`;
        }
        
        if(type === 'answer') {
             tbody.innerHTML += `<tr><td class="print-col-left">${i+1}. ${w.english}</td><td class="print-col-right">${w.meaning}</td></tr>`;
        } else {
             tbody.innerHTML += `<tr><td class="print-col-left">${i+1}. ${question}</td><td class="print-col-right" style="color:#ccc;">(정답: ${type==='test'?'':answer}) __________________</td></tr>`;
        }
    });
    
    window.print();
    setTimeout(() => { document.getElementById('print-area').style.display = 'none'; }, 1000);
}

// 교재 목록 로드 (전역 변수 + 인쇄/삭제 드롭다운 채우기)
async function loadBooks() {
    try {
        const res = await fetch(`${API_URL}/books`); 
        const data = await res.json();
        availableBooks = data; // 전역 변수에 저장
        
        // 1. 인쇄 센터 드롭다운
        const printSelect = document.getElementById('print-book-select'); 
        if(printSelect) {
            printSelect.innerHTML='<option>교재 선택</option>'; 
            data.forEach(b=>printSelect.innerHTML+=`<option>${b}</option>`);
        }

        // 2. ★ [NEW] 교재 삭제 드롭다운
        const deleteSelect = document.getElementById('delete-book-select');
        if(deleteSelect) {
            deleteSelect.innerHTML='<option>삭제할 교재 선택</option>';
            data.forEach(b=>deleteSelect.innerHTML+=`<option>${b}</option>`);
        }

    } catch(e) { console.error("교재 목록 로딩 실패", e); }
}

// 교재 삭제 함수
async function deleteBook() {
    const bookName = document.getElementById('delete-book-select').value;
    if (!bookName || bookName.includes("선택")) return alert("삭제할 교재를 선택해주세요.");

    if (!confirm(`⚠️ 정말로 [${bookName}] 교재를 삭제하시겠습니까?\n\n이 교재에 포함된 모든 단어 데이터가 영구적으로 삭제됩니다!\n(학생들의 학습 기록은 유지되지만, 단어 데이터는 사라집니다.)`)) return;

    try {
        const res = await fetch(`${API_URL}/admin/delete-book`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ book_name: bookName })
        });

        if (res.ok) {
            alert("✅ 교재가 성공적으로 삭제되었습니다.");
            loadBooks(); // 목록 갱신
        } else {
            alert("❌ 삭제 실패. 서버 로그를 확인하세요.");
        }
    } catch (e) {
        alert("서버 오류가 발생했습니다.");
    }
}