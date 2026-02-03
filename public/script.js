const API_URL = 'http://localhost:3000';
let currentWords = [];
let currentIndex = 0;
let userType = 'student';
let currentUser = '';
let quizQueue = [];
let spellingList = [];
let wrongAnswers = [];
let quizWrongAnswers = [];
let isCurrentWordWrong = false;
let pendingSubmission = null;

// 게임 변수
let gameTimer = null;
let gameScore = 0;
let rainWords = [];
let rainInterval = null;
let monsterHp = 100;
let monsterWords = [];
let monsterIndex = 0;

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

async function login() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    if (username === 'admin' && password === '1234') {
        userType = 'teacher'; showSection('teacher-section'); initTeacherView(); return;
    }
    try {
        const res = await fetch(`${API_URL}/login`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (res.ok) {
            userType = 'student';
            currentUser = data.student_name; 
            showSection('selection-section');
            document.getElementById('welcome-msg').innerText = `${data.student_name}님, 오늘도 화이팅!`;
            loadBooks(); 
        } else { document.getElementById('message').innerText = '❌ ' + data.message; }
    } catch (err) { alert("서버가 켜져있지 않은 것 같아요."); }
}
function logout() { location.reload(); }

async function saveRecord(type, score, wrongCount, wrongWordsList) {
    if (userType !== 'student') return; 
    const bookName = document.getElementById('book-select').value;
    const unitName = document.getElementById('unit-select').value;
    try {
        const res = await fetch(`${API_URL}/save-score`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ student_name: currentUser, book_name: bookName, unit_name: unitName, study_type: type, score: score, wrong_count: wrongCount, wrong_words: wrongWordsList })
        });
        const result = await res.json();
        if (res.ok) {
            if(!type.includes('game')) { alert("✅ 성공적으로 제출되었습니다! 대시보드로 돌아갑니다."); backToDashboard(); }
        } else { alert("❌ 제출 실패: " + (result.error || result.message)); }
    } catch (err) { console.error(err); }
}

function submitCurrentRecord() {
    if (!pendingSubmission) return;
    saveRecord(pendingSubmission.type, pendingSubmission.score, pendingSubmission.wrongCount, pendingSubmission.wrongWordsText);
}

async function loadBooks() {
    try {
        const res = await fetch(`${API_URL}/books`); const data = await res.json();
        const s = document.getElementById('book-select'); s.innerHTML='<option value="">📚 교재 선택</option>';
        data.forEach(b => { const o = document.createElement('option'); o.value=b; o.innerText=b; s.appendChild(o); });
        const ts = document.getElementById('teacher-book-select');
        if(ts) { ts.innerHTML='<option value="">교재 선택</option>'; data.forEach(b => { const o = document.createElement('option'); o.value=b; o.innerText=b; ts.appendChild(o); }); }
    } catch(e) {}
}
async function loadUnits() {
    const b = document.getElementById('book-select').value;
    const s = document.getElementById('unit-select'); s.innerHTML='<option>📂 유닛 선택</option>'; s.disabled=true;
    if(!b) return;
    const res = await fetch(`${API_URL}/units?book_name=${encodeURIComponent(b)}`);
    const data = await res.json();
    data.forEach(u => { const o = document.createElement('option'); o.value=u; o.innerText=u; s.appendChild(o); });
    s.disabled=false;
}
async function goToDashboard() {
    const b = document.getElementById('book-select').value; const u = document.getElementById('unit-select').value;
    if(!b || !u) return alert('모두 선택해주세요!');
    try {
        const res = await fetch(`${API_URL}/start-learning`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({book_name:b, unit_name:u}) });
        const w = await res.json();
        if(w.length===0) return alert('단어 없음');
        currentWords = w;
        document.getElementById('dash-unit-title').innerText = `${b} - ${u}`;
        showSection('dashboard-section');
    } catch(e) { alert('로드 실패'); }
}

// --- 학습 기능 (1~4번) ---
function startFlashcard() { showSection('flashcard-section'); currentIndex=0; loadFlashcard(0); }
function loadFlashcard(idx) {
    const w=currentWords[idx]; document.getElementById('fc-en').innerText=w.english; document.getElementById('fc-ko').innerText=w.meaning;
    const ex=document.getElementById('fc-ex'); if(w.example){ex.style.display='block';document.getElementById('fc-ex-text').innerText=w.example;}else ex.style.display='none';
    const syn=document.getElementById('fc-syn'); if(w.synonyms){syn.style.display='block';document.getElementById('fc-syn-text').innerText=w.synonyms;}else syn.style.display='none';
    const ant=document.getElementById('fc-ant'); if(w.antonyms){ant.style.display='block';document.getElementById('fc-ant-text').innerText=w.antonyms;}else ant.style.display='none';
    document.getElementById('flashcard').classList.remove('flipped'); isFlipped=false;
}
let isFlipped=false;
function flipCard() { document.getElementById('flashcard').classList.toggle('flipped'); isFlipped=!isFlipped; if(isFlipped) playAudio(); }
function playAudio() { if('speechSynthesis' in window){ window.speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(currentWords[currentIndex].english); u.lang='en-US'; u.rate=0.8; window.speechSynthesis.speak(u); } }
function nextCard() { if(currentIndex<currentWords.length-1) loadFlashcard(++currentIndex); else alert("마지막!"); }
function prevCard() { if(currentIndex>0) loadFlashcard(--currentIndex); }

function startSpelling() { showSection('spelling-section'); currentIndex=0; wrongAnswers=[]; isCurrentWordWrong=false; spellingList=[...currentWords]; shuffleArray(spellingList); loadSpellingQuestion(); }
function loadSpellingQuestion() {
    const w=spellingList[currentIndex]; document.getElementById('spell-meaning').innerText=w.meaning; document.getElementById('spell-input').value=''; document.getElementById('spell-feedback').innerText='';
    document.getElementById('spell-hint').innerText=`Hint: ${w.english[0]} ` + Array(w.english.length).join('_ ');
    document.getElementById('spell-score').innerText=`${currentIndex+1}/${spellingList.length}`;
    document.getElementById('spell-input').focus();
}
function checkSpelling() {
    const val=document.getElementById('spell-input').value.trim(); const w=spellingList[currentIndex];
    if(val.toLowerCase()===w.english.toLowerCase()) {
        document.getElementById('spell-feedback').innerText="딩동댕!"; document.getElementById('spell-feedback').style.color='green';
        if(isCurrentWordWrong && !wrongAnswers.some(x=>x.id===w.id)) wrongAnswers.push(w);
        setTimeout(()=>{ if(currentIndex<spellingList.length-1){currentIndex++;loadSpellingQuestion();} else showSpellingResult(); },800);
    } else { document.getElementById('spell-feedback').innerText="땡!"; document.getElementById('spell-feedback').style.color='red'; isCurrentWordWrong=true; }
}
function showSpellingResult() {
    showSection('spelling-result-section');
    const score = Math.round(((spellingList.length - wrongAnswers.length)/spellingList.length)*100);
    document.getElementById('spell-final-score').innerText = score;
    const wrongText = wrongAnswers.map(w=>w.english).join(', ');
    pendingSubmission = { type:'spelling', score:score, wrongCount:wrongAnswers.length, wrongWordsText:wrongText };
    const btn = document.getElementById('spell-submit-btn'); const msg = document.getElementById('spell-submit-msg');
    if(score<=70) { btn.disabled=true; btn.classList.add('btn-disabled'); btn.innerText="제출 불가 🚫"; msg.innerText="70점 이하는 제출 불가!"; msg.style.color="#dc3545"; }
    else { btn.disabled=false; btn.classList.remove('btn-disabled'); btn.innerText="네! 제출할게요 ✅"; msg.innerText="훌륭해요! 점수를 보낼까요?"; msg.style.color="#28a745"; }
    const div = document.getElementById('spell-wrong-word-list'); div.innerHTML='';
    if(wrongAnswers.length>0) { document.getElementById('spell-wrong-list-area').classList.remove('hidden'); wrongAnswers.forEach(w=>{ div.innerHTML+=`<div class="wrong-item"><span class="wrong-en">${w.english}</span><span class="wrong-ko">${w.meaning}</span></div>`; }); }
    else document.getElementById('spell-wrong-list-area').classList.add('hidden');
}
function startRetrySpelling() { if(wrongAnswers.length===0) return startSpelling(); spellingList=[...wrongAnswers]; shuffleArray(spellingList); wrongAnswers=[]; currentIndex=0; alert("틀린 단어 재도전!"); showSection('spelling-section'); loadSpellingQuestion(); }

function startContextQuiz() { showSection('quiz-section'); quizQueue=[]; quizWrongAnswers=[]; currentWords.forEach(w=>{ quizQueue.push({w,t:'meaning'}); if(w.example) quizQueue.push({w,t:'example'}); else quizQueue.push({w,t:'meaning'}); if(w.synonyms||w.antonyms) quizQueue.push({w,t:(w.synonyms&&w.antonyms)?(Math.random()>0.5?'synonym':'antonym'):(w.synonyms?'synonym':'antonym')}); else quizQueue.push({w,t:'meaning'}); }); shuffleArray(quizQueue); if(quizQueue.length>50) quizQueue=quizQueue.slice(0,50); currentIndex=0; loadQuizQuestion(); }
function maskWordInSentence(sentence, word) {
    if (!sentence || !word) return "";
    const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const safeWord = escapeRegExp(word);
    const variations = [safeWord];
    if (word.endsWith('y')) { const root = word.slice(0, -1); variations.push(escapeRegExp(root) + "ied"); variations.push(escapeRegExp(root) + "ies"); variations.push(escapeRegExp(word) + "ing"); } 
    else if (word.endsWith('e')) { const root = word.slice(0, -1); variations.push(escapeRegExp(root) + "ing"); variations.push(escapeRegExp(word) + "d"); variations.push(escapeRegExp(word) + "s"); } 
    else { variations.push(escapeRegExp(word) + "s"); variations.push(escapeRegExp(word) + "ed"); variations.push(escapeRegExp(word) + "ing"); }
    const pattern = new RegExp(`\\b(${variations.join('|')})\\b`, 'gi');
    let masked = sentence.replace(pattern, "_______");
    if (masked === sentence) { masked = sentence.replace(new RegExp(safeWord, 'gi'), "_______"); }
    return masked;
}
function loadQuizQuestion() {
    const q=quizQueue[currentIndex]; const w=q.w; const box=document.getElementById('quiz-question'); const badge=document.getElementById('quiz-type-badge');
    if(q.t==='example') { box.innerText=maskWordInSentence(w.example, w.english); badge.innerText="빈칸에 들어갈 말은? (Example)"; }
    else if(q.t==='synonym') { box.innerText=w.synonyms; badge.innerText="유의어는?"; }
    else if(q.t==='antonym') { box.innerText=w.antonyms; badge.innerText="반의어는?"; }
    else { box.innerText=w.meaning; badge.innerText="이 뜻의 영어 단어는?"; }
    const opts=[w]; while(opts.length<4) { const r=currentWords[Math.floor(Math.random()*currentWords.length)]; if(!opts.some(o=>o.id===r.id)) opts.push(r); } shuffleArray(opts);
    const grid=document.getElementById('quiz-options'); grid.innerHTML='';
    opts.forEach(o=>{ const b=document.createElement('button'); b.className='option-btn'; b.innerText=o.english; 
        b.onclick=()=>{ 
            if(o.id===w.id) { b.classList.add('correct'); setTimeout(()=>{ if(currentIndex<quizQueue.length-1){currentIndex++;loadQuizQuestion();} else showQuizResult(); },800); }
            else { b.classList.add('wrong'); if(!quizWrongAnswers.some(x=>x.id===w.id)) quizWrongAnswers.push(w); }
        }; grid.appendChild(b);
    });
    document.getElementById('quiz-progress').innerText = `${currentIndex+1}/${quizQueue.length}`;
}
function showQuizResult() {
    showSection('quiz-result-section');
    const score = Math.round(((quizQueue.length - quizWrongAnswers.length)/quizQueue.length)*100);
    document.getElementById('quiz-final-score').innerText = score;
    const wrongText = quizWrongAnswers.map(w=>w.english).join(', ');
    pendingSubmission = { type:'quiz', score:score, wrongCount:quizWrongAnswers.length, wrongWordsText:wrongText };
    const btn = document.getElementById('quiz-submit-btn'); const msg = document.getElementById('quiz-submit-msg');
    if(score<=70) { btn.disabled=true; btn.classList.add('btn-disabled'); btn.innerText="제출 불가 🚫"; msg.innerText="70점 이하는 제출 불가!"; msg.style.color="#dc3545"; }
    else { btn.disabled=false; btn.classList.remove('btn-disabled'); btn.innerText="제출하기 ✅"; msg.innerText="점수를 보낼까요?"; msg.style.color="#28a745"; }
    const div = document.getElementById('quiz-wrong-word-list'); div.innerHTML='';
    if(quizWrongAnswers.length>0) { document.getElementById('quiz-wrong-list-area').classList.remove('hidden'); quizWrongAnswers.forEach(w=>{ div.innerHTML+=`<div class="wrong-item"><span class="wrong-en">${w.english}</span><span class="wrong-ko">${w.meaning}</span></div>`; }); }
    else document.getElementById('quiz-wrong-list-area').classList.add('hidden');
}
function startRetryQuiz() { if(quizWrongAnswers.length===0) return startContextQuiz(); quizQueue=[]; quizWrongAnswers.forEach(w=>quizQueue.push({w,t:'meaning'})); quizWrongAnswers=[]; shuffleArray(quizQueue); currentIndex=0; alert("틀린 문제 재도전!"); showSection('quiz-section'); loadQuizQuestion(); }

// --- 5. 카드 짝맞추기 ---
let memCards=[], flippedCards=[], matchedCount=0;
function startMemoryGame() {
    if(currentWords.length<8) return alert("단어가 너무 적어요!"); showSection('memory-game-section'); gameScore=0; matchedCount=0; document.getElementById('mem-score').innerText=0; document.getElementById('mem-time').innerText=60;
    const words = [...currentWords].sort(()=>0.5-Math.random()).slice(0,8);
    memCards=[]; words.forEach((w,i)=>{ memCards.push({id:i,t:w.english}); memCards.push({id:i,t:w.meaning}); });
    memCards.sort(()=>0.5-Math.random());
    const grid=document.getElementById('memory-grid'); grid.innerHTML='';
    memCards.forEach((c,i)=>{ const el=document.createElement('div'); el.className='memory-card'; el.dataset.idx=i; el.innerText='?'; el.onclick=()=>flipMemCard(el,c); grid.appendChild(el); });
    if(gameTimer) clearInterval(gameTimer); let t=60; gameTimer=setInterval(()=>{ t--; document.getElementById('mem-time').innerText=t; if(t<=0) finishGame('game_memory',gameScore); },1000);
}
function flipMemCard(el,c) { 
    if(el.classList.contains('flipped')||flippedCards.length>=2) return; 
    el.classList.add('flipped'); el.innerText=c.t; 
    flippedCards.push({el,c}); if(flippedCards.length===2) checkMatch(); 
}
function checkMatch() {
    const [c1,c2]=flippedCards;
    if(c1.c.id===c2.c.id) { gameScore+=100; document.getElementById('mem-score').innerText=gameScore; c1.el.classList.add('matched'); c2.el.classList.add('matched'); matchedCount++; flippedCards=[]; if(matchedCount===8) finishGame('game_memory',gameScore+500); }
    else { setTimeout(()=>{ c1.el.classList.remove('flipped'); c1.el.innerText='?'; c2.el.classList.remove('flipped'); c2.el.innerText='?'; flippedCards=[]; },1000); }
}

// --- 6. 단어 산성비 (수정됨: 맞추면 뜻 보여주기) ---
function startWordRain() {
    showSection('word-rain-section'); gameScore=0; rainWords=[]; let life=3; document.getElementById('rain-score').innerText=0; document.getElementById('rain-life').innerText="❤️❤️❤️";
    const cont=document.getElementById('rain-canvas-container'); cont.innerHTML=''; document.getElementById('rain-input').value=''; document.getElementById('rain-input').focus();
    
    stopGame(); // 기존 타이머 초기화
    let tick=0;
    
    rainInterval=setInterval(()=>{
        tick++; 
        // 1. 단어 생성
        if(tick%20===0) { 
            const w=currentWords[Math.floor(Math.random()*currentWords.length)]; 
            const el=document.createElement('div'); el.className='rain-word'; el.innerText=w.english; 
            el.style.left=Math.random()*(cont.clientWidth-80)+'px'; el.style.top='0px'; cont.appendChild(el); 
            // 뜻도 같이 저장
            rainWords.push({el, english: w.english, meaning: w.meaning, top:0}); 
        }
        // 2. 단어 이동
        rainWords.forEach((item,i)=>{ 
            item.top+=5; item.el.style.top=item.top+'px'; 
            if(item.top>380){ 
                item.el.remove(); rainWords.splice(i,1); life--; document.getElementById('rain-life').innerText="❤️".repeat(life); 
                if(life<=0) finishGame('game_rain',gameScore); 
            } 
        });
    },100);

    // 3. 입력 처리
    document.getElementById('rain-input').onkeydown=(e)=>{ 
        if(e.key==='Enter'){ 
            const v=e.target.value.trim(); 
            const idx=rainWords.findIndex(x=>x.english.toLowerCase()===v.toLowerCase()); 
            if(idx>-1){ 
                const target = rainWords[idx];
                // 리스트에서 먼저 제거 (버그 방지)
                rainWords.splice(idx, 1);
                
                // ★ 맞추면 뜻으로 변신!
                target.el.innerText = target.meaning; // 영어 -> 한글 뜻
                target.el.style.color='#ffeb3b';      // 노란색으로 강조
                target.el.style.transform='scale(1.3)';
                target.el.style.textShadow='0 0 10px #ff9800'; // 발광 효과
                
                // 0.5초 뒤에 사라짐 (읽을 시간 줌)
                setTimeout(()=>target.el.remove(), 500); 
                
                gameScore+=50; 
                document.getElementById('rain-score').innerText=gameScore; 
                e.target.value=''; 
            } 
        } 
    };
}

// --- 7. 단어 몬스터 ---
function startMonsterGame() {
    if(currentWords.length<10) return alert("단어가 10개 이상 필요해요!");
    showSection('monster-game-section');
    gameScore=0; monsterHp=100; monsterIndex=0;
    document.getElementById('monster-hp').style.width='100%';
    document.getElementById('monster-hp-text').innerText='100';
    // 몬스터용 랜덤 10단어
    monsterWords = [...currentWords].sort(()=>0.5-Math.random()).slice(0,10);
    loadMonsterQuiz();
}
function loadMonsterQuiz() {
    const w = monsterWords[monsterIndex];
    document.getElementById('mon-question').innerText = w.meaning; // 뜻 보여줌
    
    // 보기 생성
    const opts=[w]; while(opts.length<4) { const r=currentWords[Math.floor(Math.random()*currentWords.length)]; if(!opts.some(o=>o.id===r.id)) opts.push(r); } shuffleArray(opts);
    const grid=document.getElementById('mon-options'); grid.innerHTML='';
    opts.forEach(o=>{ 
        const b=document.createElement('button'); b.className='option-btn'; b.innerText=o.english; 
        b.onclick=()=>{ 
            if(o.id===w.id) { 
                b.classList.add('correct');
                hitMonster();
                setTimeout(()=>{ 
                    monsterIndex++;
                    if(monsterIndex < 10) loadMonsterQuiz();
                    else finishGame('game_monster', gameScore + 1000); 
                }, 800);
            } else { b.classList.add('wrong'); }
        }; 
        grid.appendChild(b); 
    });
}
function hitMonster() {
    monsterHp -= 10;
    document.getElementById('monster-hp').style.width = monsterHp+'%';
    document.getElementById('monster-hp-text').innerText = monsterHp;
    gameScore += 100;
    
    const dmg = document.getElementById('monster-damage');
    dmg.classList.remove('hidden');
    dmg.innerText = "-10";
    setTimeout(()=>dmg.classList.add('hidden'), 500);
}

// --- 공통 게임 종료 ---
async function finishGame(type, score) {
    stopGame(); showSection('game-result-section'); document.getElementById('game-final-score').innerText=score;
    // 다시 하기 버튼 설정
    const replayBtn = document.getElementById('btn-replay-game');
    if(type==='game_memory') replayBtn.onclick = startMemoryGame;
    else if(type==='game_rain') replayBtn.onclick = startWordRain;
    else if(type==='game_monster') replayBtn.onclick = startMonsterGame;

    await saveRecord(type, score, 0, ''); 
    const res = await fetch(`${API_URL}/rankings?game_type=${type}`); const ranks=await res.json();
    const div=document.getElementById('ranking-container'); div.innerHTML='';
    ranks.forEach((r,i)=>{ div.innerHTML+=`<div class="ranking-item"><span>${i===0?'🥇':i===1?'🥈':i===2?'🥉':''} ${i+1}. ${r.who}</span><b>${r.score}</b></div>`; });
}
function stopGame() { 
    if(gameTimer) clearInterval(gameTimer); 
    if(rainInterval) clearInterval(rainInterval); 
}

function startTest() { alert("시험 모드 준비중!"); }
function initTeacherView() { loadBooks(); }
function renderTeacherTable() {}
function printTestPaper() {}

function showGameZone() { /* 이제 안 씀 */ }
function showSection(id) { document.querySelectorAll('.container > div').forEach(d=>d.classList.add('hidden')); document.getElementById(id).classList.remove('hidden'); }

// 수정된 뒤로가기 버튼 기능 (게임 종료 후 이동)
function backToDashboard() { 
    stopGame(); // 게임 멈추기
    showSection('dashboard-section'); 
}
function goBackToSelection() { showSection('selection-section'); }

function addEnterListener(id, action) { const el=document.getElementById(id); if(el) el.addEventListener('keydown',e=>{if(e.key==='Enter')action();}); }
addEnterListener('spell-input', checkSpelling); addEnterListener('password', login); addEnterListener('username', login);