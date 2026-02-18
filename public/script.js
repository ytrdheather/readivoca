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

// ★ 개발자 치트키: 7단계까지 모두 해금 (나중에 1로 변경하세요!)
let currentUnlockStage = 7; 

// ★ 딴짓 방지 변수
let isStudyActive = false;
let blurWarningCount = 0; 

// ★ 학습 시간 및 시도 횟수 측정 변수
let studyStartTime = 0;
let sessionRetryCount = 0;

// 게임 변수
let gameTimer = null;
let gameScore = 0;
let rainWords = [];
let rainInterval = null;
let monsterHp = 100;
let playerHp = 100;
let monsterWords = [];
let monsterIndex = 0;
let rain2000SoundPlayed = false; 

// ★ 카드 게임 변수 (라운드 관리)
let memoryRemainingWords = [];
let memoryRound = 1;

// --- 효과음 설정 ---
// 몬스터 BGM
const monsterBgm = new Audio('monster_bgm.mp3');
monsterBgm.loop = true; 
monsterBgm.volume = 0.3; 

// BGM 토글 함수
function toggleMonsterBgm() {
    const btn = document.getElementById('bgm-toggle-btn');
    if (monsterBgm.paused) {
        monsterBgm.play().catch(e => {});
        btn.innerHTML = '<i class="fa-solid fa-volume-high"></i>';
    } else {
        monsterBgm.pause();
        btn.innerHTML = '<i class="fa-solid fa-volume-xmark"></i>';
    }
}

// --- 효과음 함수 모음 ---
function playCorrectSound() { const a = new Audio('pass.mp3'); a.volume=0.5; a.play().catch(e=>{}); }
function playQuizCorrectSound() { const a = new Audio('correct1.mp3'); a.volume=0.5; a.play().catch(e=>{}); }
function playYeahSound() { const a = new Audio('yeah.mp3'); a.volume=0.6; a.play().catch(e=>{}); }
function playCompletedSound() { const a = new Audio('completed.mp3'); a.volume=0.6; a.play().catch(e=>{}); }
function playAchievementSound() { const a = new Audio('achievement1.mp3'); a.volume=0.6; a.play().catch(e=>{}); }
function playTestFinishSound() { const a = new Audio('test_finish.mp3'); a.volume=0.6; a.play().catch(e=>{}); }
function playAcidRainSound() { const a = new Audio('acidrain.mp3'); a.volume=0.5; a.play().catch(e=>{}); }
function playMonsterScream() { const a = new Audio('monsterscrem.mp3'); a.volume=0.6; a.play().catch(e=>{}); }
function playPlayerHitSound() { const a = new Audio('hit_sound.mp3'); a.volume=0.6; a.play().catch(e=>{}); }

// ★ 폭죽 효과
function triggerConfetti() {
    if (typeof confetti === 'function') {
        var duration = 3000; var animationEnd = Date.now() + duration; var defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };
        var interval = setInterval(function() {
            var timeLeft = animationEnd - Date.now(); if (timeLeft <= 0) return clearInterval(interval);
            var particleCount = 50 * (timeLeft / duration); confetti(Object.assign({}, defaults, { particleCount, origin: { x: Math.random(), y: Math.random() - 0.2 } }));
        }, 250);
    }
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

window.addEventListener('blur', () => {
    if (isStudyActive) {
        if (blurWarningCount === 0) {
            alert("⚠️ [주의] 화면을 벗어나셨군요!\n\n실수일 수 있으니 한 번은 봐드립니다.\n한 번 더 화면을 이탈하면 학습이 즉시 종료되고 0점 처리됩니다.\n집중해주세요! 👀");
            blurWarningCount++;
        } else {
            alert("🚨 [경고] 화면 이탈이 반복되었습니다.\n\n규정에 따라 학습을 중단하고 0점 처리합니다.");
            stopStudyAndExit(); 
        }
    }
});

// ★ [수정됨] 로그인 함수: 선생님이면 teacher.html로 이동!
async function login() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    // 선생님 계정 체크
    if (username === 'admin' && password === '1234') {
        // 기존: userType = 'teacher'; showSection('teacher-section'); ...
        // 변경: 페이지 이동
        window.location.href = 'teacher.html';
        return;
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
    } catch (err) { alert("서버 연결 실패"); }
}
function logout() { location.reload(); }

function updateMenuUI() {
    for (let i = 1; i <= 7; i++) {
        const card = document.getElementById(`menu-${i}`);
        const icon = card.querySelector('.status-icon i');
        if (i <= currentUnlockStage) {
            card.classList.remove('locked');
            card.classList.add('unlocked');
            icon.className = 'fa-solid fa-lock-open';
        } else {
            card.classList.add('locked');
            card.classList.remove('unlocked');
            icon.className = 'fa-solid fa-lock';
        }
    }
}

// 7번 테스트 클릭 시 선생님 승인 체크
async function tryStart(stage, startFunction) {
    if (stage > currentUnlockStage) {
        alert(`🔒 이전 단계를 먼저 완료하세요!`);
        return;
    }
    
    // 7단계(실전 테스트)는 서버 승인 체크
    if (stage === 7) {
        const book = document.getElementById('book-select').value;
        const unit = document.getElementById('unit-select').value;
        
        try {
            const res = await fetch(`${API_URL}/test/status?student_name=${encodeURIComponent(currentUser)}&book_name=${encodeURIComponent(book)}&unit_name=${encodeURIComponent(unit)}`);
            const data = await res.json();

            if (data.status === 'approved') {
                alert("✅ 선생님 승인 완료! 시험을 시작합니다. 화이팅!");
            } else if (data.status === 'pending') {
                alert("⏳ 선생님 승인을 기다리는 중입니다.\n잠시 후 다시 눌러주세요.");
                return; // 시작 못 함
            } else {
                if (confirm("📝 실전 테스트를 보려면 선생님 승인이 필요합니다.\n요청을 보낼까요?")) {
                    await fetch(`${API_URL}/test/request`, {
                        method: 'POST', headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ student_name: currentUser, book_name: book, unit_name: unit })
                    });
                    alert("🚀 요청을 보냈습니다! 선생님이 승인해주시면 다시 누르세요.");
                }
                return; // 시작 못 함
            }
        } catch (e) {
            console.error(e);
            alert("서버 통신 오류");
            return;
        }
    }
    
    studyStartTime = Date.now();
    sessionRetryCount = 0; 
    blurWarningCount = 0; 
    
    // 1(암기), 2(카드), 4(산성비), 6(몬스터)는 딴짓 방지 해제
    const SAFE_STAGES = [1, 2, 4, 6];
    if (SAFE_STAGES.includes(stage)) {
        isStudyActive = false;
    } else {
        isStudyActive = true; 
    }
    
    startFunction();
}

function getProgressKey() {
    const book = document.getElementById('book-select').value;
    const unit = document.getElementById('unit-select').value;
    return `progress_${currentUser}_${book}_${unit}`;
}

function saveProgress() {
    const key = getProgressKey();
    localStorage.setItem(key, currentUnlockStage);
}

function loadProgress() {
    const key = getProgressKey();
    const savedStage = localStorage.getItem(key);
    if (savedStage) {
        currentUnlockStage = parseInt(savedStage);
    } else {
        currentUnlockStage = 1; 
    }
}

function unlockNextStep() {
    if (currentUnlockStage < 7) {
        currentUnlockStage++;
        saveProgress(); 
        alert(`🎉 축하합니다! ${currentUnlockStage}단계 해제!`);
    }
    backToDashboard();
}

function stopStudyAndExit() {
    isStudyActive = false; stopGame(); currentIndex = 0; quizQueue = []; wrongAnswers = [];
    showSection('dashboard-section'); updateMenuUI();
}

// --- API ---
async function saveRecord(type, score, wrongCount, wrongWordsList, duration, tryCount) {
    if (userType !== 'student') return; 
    const book = document.getElementById('book-select').value; const unit = document.getElementById('unit-select').value;
    try { await fetch(`${API_URL}/save-score`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ student_name: currentUser, book_name: book, unit_name: unit, study_type: type, score: score, wrong_count: wrongCount, wrong_words: wrongWordsList, duration: duration, try_count: tryCount }) }); } catch (err) {}
}
function submitCurrentRecord() {
    if (!pendingSubmission) return;
    saveRecord(
        pendingSubmission.type, 
        pendingSubmission.score, 
        pendingSubmission.wrongCount, 
        pendingSubmission.wrongWordsText,
        pendingSubmission.duration,
        pendingSubmission.tryCount
    );
    if (pendingSubmission.score > 70) unlockNextStep(); else { alert("70점 미만입니다 ㅠㅠ"); backToDashboard(); }
}
async function loadBooks() { try { const res = await fetch(`${API_URL}/books`); const data = await res.json(); const s = document.getElementById('book-select'); s.innerHTML='<option value="">📚 교재 선택</option>'; data.forEach(b => s.innerHTML+=`<option>${b}</option>`); } catch(e){} }
async function loadUnits() { const b = document.getElementById('book-select').value; const s = document.getElementById('unit-select'); s.innerHTML='<option>📂 유닛 선택</option>'; s.disabled=true; if(!b) return; const res = await fetch(`${API_URL}/units?book_name=${encodeURIComponent(b)}`); const data = await res.json(); data.forEach(u => s.innerHTML+=`<option>${u}</option>`); s.disabled=false; }

async function goToDashboard() { 
    const b = document.getElementById('book-select').value; const u = document.getElementById('unit-select').value; 
    if(!b || !u) return alert('모두 선택해주세요!'); 
    try { 
        const res = await fetch(`${API_URL}/start-learning`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({book_name:b, unit_name:u}) }); 
        const w = await res.json(); 
        if(w.length===0) return alert('단어 없음'); 
        currentWords = w; 
        document.getElementById('dash-unit-title').innerText = `${b} - ${u}`; 
        
        loadProgress();
        // Day 02 치트키
        if (u.toUpperCase().includes("DAY 02")) { currentUnlockStage = 7; console.log("⚡ Day 02: 모든 단계 해금!"); }
        
        updateMenuUI(); 
        showSection('dashboard-section'); 
    } catch(e) { alert('로드 실패'); } 
}

// 1. 암기
function startFlashcard() { showSection('flashcard-section'); currentIndex=0; loadFlashcard(0); }
function loadFlashcard(idx) {
    const w=currentWords[idx]; document.getElementById('fc-en').innerText=w.english; document.getElementById('fc-ko').innerText=w.meaning;
    const ex=document.getElementById('fc-ex'); const ext=document.getElementById('fc-ex-text'); document.querySelector('#fc-ex .info-label').innerText = "EXAMPLE (예문)";
    if(w.example){ex.style.display='block';ext.innerText=w.example;ext.onclick=(e)=>{e.stopPropagation();playAudio(w.example);};}else ex.style.display='none';
    const syn=document.getElementById('fc-syn'); const synt=document.getElementById('fc-syn-text'); document.querySelector('#fc-syn .info-label').innerText = "SYNONYMS (동의어)";
    if(w.synonyms){syn.style.display='block';synt.innerText=w.synonyms;synt.onclick=(e)=>{e.stopPropagation();playAudio(w.synonyms);};}else syn.style.display='none';
    const ant=document.getElementById('fc-ant'); const antt=document.getElementById('fc-ant-text'); document.querySelector('#fc-ant .info-label').innerText = "ANTONYMS (반의어)";
    if(w.antonyms){ant.style.display='block';antt.innerText=w.antonyms;antt.onclick=(e)=>{e.stopPropagation();playAudio(w.antonyms);};}else ant.style.display='none';
    document.getElementById('flashcard').classList.remove('flipped'); isFlipped=false;
}
let isFlipped=false;
function flipCard() { document.getElementById('flashcard').classList.toggle('flipped'); isFlipped=!isFlipped; if(isFlipped) playAudio(); }
function playAudio(text) { if('speechSynthesis' in window){ window.speechSynthesis.cancel(); const content = text || currentWords[currentIndex].english; const u=new SpeechSynthesisUtterance(content); u.lang='en-US'; u.rate=0.8; window.speechSynthesis.speak(u); } }
function nextCard() { if(currentIndex<currentWords.length-1) loadFlashcard(++currentIndex); else alert("마지막입니다!"); }
function prevCard() { if(currentIndex>0) loadFlashcard(--currentIndex); }
function finishFlashcard() { playCompletedSound(); unlockNextStep(); }

// 2. 카드 짝맞추기
let memCards=[], flippedCards=[], matchedCount=0;
function startMemoryGame() {
    if(currentWords.length<8) { isStudyActive = false; alert("⚡ 단어 부족 자동 통과!"); unlockNextStep(); return; }
    showSection('memory-game-section'); gameScore=0; matchedCount=0; document.getElementById('mem-score').innerText=0; document.getElementById('mem-time').innerText=60;
    memoryRemainingWords = [...currentWords].sort(()=>0.5-Math.random());
    startMemoryRound();
    if(gameTimer) clearInterval(gameTimer); let t=60; gameTimer=setInterval(()=>{ t--; document.getElementById('mem-time').innerText=t; if(t<=0) finishGame('game_memory', gameScore); },1000);
}
function startMemoryRound() {
    if (memoryRemainingWords.length === 0) { playYeahSound(); finishGame('game_memory', gameScore + 1000); return; }
    const roundWords = memoryRemainingWords.splice(0, 8);
    memCards=[]; matchedCount=0;
    roundWords.forEach((w,i)=>{ memCards.push({id:i, t:w.english, pair:w.meaning}); memCards.push({id:i, t:w.meaning, pair:w.english}); });
    memCards.sort(()=>0.5-Math.random());
    const grid=document.getElementById('memory-grid'); grid.innerHTML='';
    memCards.forEach((c,i)=>{ const el=document.createElement('div'); el.className='memory-card'; el.dataset.idx=i; el.innerText='?'; el.onclick=()=>flipMemCard(el,c); grid.appendChild(el); });
}
function flipMemCard(el,c) { if(el.classList.contains('flipped')||el.classList.contains('matched')||flippedCards.length>=2) return; el.classList.add('flipped'); el.innerText=c.t; flippedCards.push({el,c}); if(flippedCards.length===2) checkMatch(); }
function checkMatch() {
    const [c1,c2]=flippedCards;
    if(c1.c.id===c2.c.id) { 
        playAchievementSound(); 
        gameScore+=100; document.getElementById('mem-score').innerText=gameScore; 
        c1.el.classList.add('blink'); c2.el.classList.add('blink'); 
        matchedCount++; flippedCards=[]; 
        setTimeout(() => {
            c1.el.classList.remove('blink'); c1.el.classList.add('matched');
            c2.el.classList.remove('blink'); c2.el.classList.add('matched');
            if(matchedCount === memCards.length/2) setTimeout(startMemoryRound, 500); 
        }, 1500);
    }
    else { setTimeout(()=>{ c1.el.classList.remove('flipped'); c1.el.innerText='?'; c2.el.classList.remove('flipped'); c2.el.innerText='?'; flippedCards=[]; },1000); }
}

// 3. 반복 훈련
function startContextQuiz() { 
    showSection('quiz-section'); 
    quizQueue=[]; quizWrongAnswers=[]; 
    
    currentWords.forEach(w=>{ 
        quizQueue.push({w,t:'meaning'}); 
        if(w.example) quizQueue.push({w,t:'example'}); 
        else quizQueue.push({w,t:'meaning'}); 
        
        if(w.synonyms||w.antonyms) { 
            // ★ [수정] qType -> t (변수명 오타 수정)
            let t = (w.synonyms&&w.antonyms)?(Math.random()>0.5?'synonym':'antonym'):(w.synonyms?'synonym':'antonym'); 
            quizQueue.push({w,t:t}); 
        } else {
            quizQueue.push({w,t:'meaning'}); 
        }
    }); 
    
    shuffleArray(quizQueue); 
    const TEST_LIMIT = 5; if(quizQueue.length > TEST_LIMIT) quizQueue = quizQueue.slice(0, TEST_LIMIT); 
    currentIndex=0; loadQuizQuestion(); 
}
function maskWordInSentence(s, w) { if(!s||!w)return ""; const r=new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi'); return s.replace(r,'_______'); }
function loadQuizQuestion() {
    const q=quizQueue[currentIndex]; const w=q.w; const box=document.getElementById('quiz-question'); const badge=document.getElementById('quiz-type-badge');
    box.style.fontSize = '1.3rem'; 
    if(q.t==='example') { box.innerText=maskWordInSentence(w.example, w.english); badge.innerText="빈칸에 들어갈 말은? (Example)"; } else if(q.t==='synonym') { box.innerText=w.synonyms; badge.innerText="유의어는?"; } else if(q.t==='antonym') { box.innerText=w.antonyms; badge.innerText="반의어는?"; } else { box.innerText=w.meaning; badge.innerText="이 뜻의 영어 단어는?"; }
    const opts=[w]; while(opts.length<4) { const r=currentWords[Math.floor(Math.random()*currentWords.length)]; if(!opts.some(o=>o.id===r.id)) opts.push(r); } shuffleArray(opts);
    const grid=document.getElementById('quiz-options'); grid.innerHTML='';
    opts.forEach(o=>{ const b=document.createElement('button'); b.className='option-btn'; b.innerText=o.english; 
        b.onclick=()=>{ 
            if(o.id===w.id) { 
                playQuizCorrectSound(); 
                b.classList.add('correct'); setTimeout(()=>{ if(currentIndex<quizQueue.length-1){currentIndex++;loadQuizQuestion();} else showQuizResult(); },800); 
            } else { b.classList.add('wrong'); if(!quizWrongAnswers.some(x=>x.id===w.id)) quizWrongAnswers.push(w); } 
        }; grid.appendChild(b); 
    });
    document.getElementById('quiz-progress').innerText = `${currentIndex+1}/${quizQueue.length}`;
}
function showQuizResult() {
    playCompletedSound(); 
    showSection('quiz-result-section');
    const score = Math.round(((quizQueue.length - quizWrongAnswers.length)/quizQueue.length)*100);
    document.getElementById('quiz-final-score').innerText = score;
    const wrongText = quizWrongAnswers.map(w=>w.english).join(', ');
    const duration = Math.floor((Date.now() - studyStartTime) / 1000);
    pendingSubmission = { type:'quiz', score, wrongCount:quizWrongAnswers.length, wrongWordsText:wrongText, duration, tryCount:sessionRetryCount+1 };
    const btn=document.getElementById('quiz-submit-btn'); const msg=document.getElementById('quiz-submit-msg');
    if(score<=70) { btn.disabled=true; btn.classList.add('btn-disabled'); btn.innerText="제출 불가 🚫"; msg.innerText="70점 이하는 제출 불가!"; msg.style.color="#dc3545"; } else { btn.disabled=false; btn.classList.remove('btn-disabled'); btn.innerText="제출하기 ✅"; msg.innerText="점수를 보낼까요?"; msg.style.color="#28a745"; }
    const div=document.getElementById('quiz-wrong-word-list'); div.innerHTML='';
    if(quizWrongAnswers.length>0) { document.getElementById('quiz-wrong-list-area').classList.remove('hidden'); quizWrongAnswers.forEach(w=>{ div.innerHTML+=`<div class="wrong-item"><span class="wrong-en">${w.english}</span><span class="wrong-ko">${w.meaning}</span></div>`; }); } else document.getElementById('quiz-wrong-list-area').classList.add('hidden');
}
function startRetryQuiz() { if(quizWrongAnswers.length===0) return startContextQuiz(); quizQueue=[]; quizWrongAnswers.forEach(w=>quizQueue.push({w,t:'meaning'})); quizWrongAnswers=[]; shuffleArray(quizQueue); currentIndex=0; alert("틀린 문제 재도전!"); showSection('quiz-section'); loadQuizQuestion(); }

// 4. 단어 산성비
function startWordRain() {
    showSection('word-rain-section'); gameScore=0; rainWords=[]; let life=3; document.getElementById('rain-score').innerText=0; document.getElementById('rain-life').innerText="❤️❤️❤️";
    document.getElementById('btn-rain-early-exit').classList.add('hidden');
    const cont=document.getElementById('rain-canvas-container'); cont.innerHTML=''; document.getElementById('rain-input').value=''; document.getElementById('rain-input').focus();
    stopGame(); let tick=0; rain2000SoundPlayed = false; 
    rainInterval=setInterval(()=>{
        tick++; 
        if(tick%20===0) { const w=currentWords[Math.floor(Math.random()*currentWords.length)]; const el=document.createElement('div'); el.className='rain-word'; el.innerText=w.english; el.style.left=Math.random()*(cont.clientWidth-80)+'px'; el.style.top='0px'; cont.appendChild(el); rainWords.push({el,english:w.english,meaning:w.meaning,top:0}); }
        rainWords.forEach((item,i)=>{ item.top+=5; item.el.style.top=item.top+'px'; if(item.top>380){ item.el.remove(); rainWords.splice(i,1); life--; document.getElementById('rain-life').innerText="❤️".repeat(life); if(life<=0) finishGame('game_rain',gameScore); } });
    },100);
    document.getElementById('rain-input').onkeydown=(e)=>{ 
        if(e.key==='Enter'){ 
            const v=e.target.value.trim(); const idx=rainWords.findIndex(x=>x.english.toLowerCase()===v.toLowerCase()); 
            if(idx>-1){ 
                const target = rainWords[idx]; rainWords.splice(idx, 1);
                target.el.innerText = target.meaning; target.el.style.color='#ffeb3b'; target.el.style.transform='scale(1.3)'; setTimeout(()=>target.el.remove(),500); 
                gameScore+=50; document.getElementById('rain-score').innerText=gameScore; 
                if(gameScore >= 2000 && !rain2000SoundPlayed) { playYeahSound(); rain2000SoundPlayed = true; document.getElementById('btn-rain-early-exit').classList.remove('hidden'); }
                if(gameScore >= 4000) { playYeahSound(); finishGame('game_rain_clear', gameScore); }
                e.target.value=''; playAcidRainSound(); 
            } 
        } 
    };
}

// 5. 스펠링
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
        playCorrectSound(); document.getElementById('spell-feedback').innerText="딩동댕!"; document.getElementById('spell-feedback').style.color='green';
        if(isCurrentWordWrong && !wrongAnswers.some(x=>x.id===w.id)) wrongAnswers.push(w);
        setTimeout(()=>{ if(currentIndex<spellingList.length-1){currentIndex++;loadSpellingQuestion();} else showSpellingResult(); },800);
    } else { document.getElementById('spell-feedback').innerText="땡!"; document.getElementById('spell-feedback').style.color='red'; isCurrentWordWrong=true; }
}
function showSpellingResult() {
    playCompletedSound(); 
    showSection('spelling-result-section');
    const score = Math.round(((spellingList.length - wrongAnswers.length)/spellingList.length)*100);
    document.getElementById('spell-final-score').innerText = score;
    const wrongText = wrongAnswers.map(w=>w.english).join(', ');
    pendingSubmission = { type:'spelling', score:score, wrongCount:wrongAnswers.length, wrongWordsText:wrongText, duration: Math.floor((Date.now() - studyStartTime) / 1000), tryCount: sessionRetryCount + 1 };
    const btn = document.getElementById('spell-submit-btn'); const msg = document.getElementById('spell-submit-msg');
    if(score<=70) { btn.disabled=true; btn.classList.add('btn-disabled'); btn.innerText="제출 불가 🚫"; msg.innerText="70점 이하는 제출 불가!"; msg.style.color="#dc3545"; } else { btn.disabled=false; btn.classList.remove('btn-disabled'); btn.innerText="네! 제출할게요 ✅"; msg.innerText="훌륭해요! 점수를 보낼까요?"; msg.style.color="#28a745"; }
    const div = document.getElementById('spell-wrong-word-list'); div.innerHTML='';
    if(wrongAnswers.length>0) { document.getElementById('spell-wrong-list-area').classList.remove('hidden'); wrongAnswers.forEach(w=>{ div.innerHTML+=`<div class="wrong-item"><span class="wrong-en">${w.english}</span><span class="wrong-ko">${w.meaning}</span></div>`; }); } else document.getElementById('spell-wrong-list-area').classList.add('hidden');
}
function startRetrySpelling() { if(wrongAnswers.length===0) return startSpelling(); spellingList=[...wrongAnswers]; shuffleArray(spellingList); wrongAnswers=[]; currentIndex=0; alert("틀린 단어 재도전!"); showSection('spelling-section'); loadSpellingQuestion(); }

// 6. 단어 몬스터
function startMonsterGame() {
    if(currentWords.length < 10) { isStudyActive = false; alert("⚡ 단어 부족 자동 통과!"); unlockNextStep(); return; }

    showSection('monster-game-section'); gameScore=0; monsterHp=100; playerHp=100; monsterIndex=0;
    document.getElementById('monster-hp').style.width='100%'; document.getElementById('monster-hp-text').innerText='100';
    document.getElementById('player-hp').style.width='100%'; document.getElementById('player-hp-text').innerText='100'; document.getElementById('player-img').innerText='😊';
    monsterBgm.currentTime = 0; monsterBgm.play().catch(e => console.log('BGM 재생 실패'));
    monsterWords = [...currentWords].sort(()=>0.5-Math.random()).slice(0,10);
    loadMonsterQuiz();
}
function loadMonsterQuiz() {
    const w = monsterWords[monsterIndex]; document.getElementById('mon-question').innerText = w.meaning;
    const opts=[w]; while(opts.length<4) { const r=currentWords[Math.floor(Math.random()*currentWords.length)]; if(!opts.some(o=>o.id===r.id)) opts.push(r); } shuffleArray(opts);
    const grid=document.getElementById('mon-options'); grid.innerHTML='';
    opts.forEach(o=>{ const b=document.createElement('button'); b.className='option-btn'; b.innerText=o.english; 
        b.onclick=()=>{ 
            if(o.id===w.id) { 
                playCorrectSound(); // 🔔 효과음
                b.classList.add('correct'); hitMonster(); setTimeout(()=>{ monsterIndex++; if(monsterIndex < 10) loadMonsterQuiz(); else finishGame('game_monster', gameScore + 1000); }, 800); 
            } else { b.classList.add('wrong'); hitPlayer(); } 
        }; grid.appendChild(b); 
    });
}
function hitMonster() { monsterHp -= 10; document.getElementById('monster-hp').style.width = monsterHp+'%'; document.getElementById('monster-hp-text').innerText = monsterHp; gameScore += 100; playMonsterScream(); const monsterImg = document.getElementById('monster-img'); monsterImg.classList.add('shake-anim'); setTimeout(()=>monsterImg.classList.remove('shake-anim'), 500); const dmg = document.getElementById('monster-damage'); dmg.classList.remove('hidden'); dmg.innerText = "-10"; setTimeout(()=>dmg.classList.add('hidden'), 500); const msg = document.getElementById('monster-msg'); msg.classList.remove('hidden'); setTimeout(()=>msg.classList.add('hidden'), 500); }
function hitPlayer() { playerHp -= 20; document.getElementById('player-hp').style.width = Math.max(0, playerHp) + '%'; document.getElementById('player-hp-text').innerText = Math.max(0, playerHp); playPlayerHitSound(); const playerImg = document.getElementById('player-img'); playerImg.innerText = '😭'; playerImg.classList.add('shake-anim'); setTimeout(()=> { playerImg.classList.remove('shake-anim'); if(playerHp > 0) playerImg.innerText = '😊'; }, 500); const dmg = document.getElementById('player-damage'); dmg.classList.remove('hidden'); dmg.innerText = "-20"; setTimeout(()=>dmg.classList.add('hidden'), 500); const msg = document.getElementById('player-msg'); msg.classList.remove('hidden'); setTimeout(()=>msg.classList.add('hidden'), 500); if(playerHp <= 0) setTimeout(() => finishGame('game_monster_fail', gameScore), 500); }

// 7. 실전 테스트
let testQueue=[], testWrongAnswers=[];
function startTest() { showSection('test-section'); currentIndex=0; testWrongAnswers=[]; let part1=currentWords.map(w=>({w,t:'sub'})); shuffleArray(part1); let part2=currentWords.map(w=>({w,t:'obj'})); shuffleArray(part2); testQueue=[...part1,...part2]; loadTestQuestion(); }
function loadTestQuestion() {
    const q=testQueue[currentIndex]; const w=q.w;
    document.getElementById('test-progress').innerText = `${currentIndex + 1} / ${testQueue.length}`; document.getElementById('test-feedback').innerText = '';
    const qBox = document.getElementById('test-question'); const inp = document.getElementById('test-input'); const btn = document.querySelector('#test-section .btn-primary'); 
    let grid = document.getElementById('test-options-grid'); if(!grid) { grid=document.createElement('div'); grid.id='test-options-grid'; grid.className='option-grid'; qBox.parentNode.insertBefore(grid, qBox.nextSibling); } grid.innerHTML='';
    if(q.t==='sub') { qBox.innerText=w.meaning; qBox.style.fontSize="1rem"; inp.style.display='block'; btn.style.display='block'; grid.style.display='none'; inp.value=''; inp.focus(); }
    else { qBox.innerText=w.english; qBox.style.fontSize="1.5rem"; inp.style.display='none'; btn.style.display='none'; grid.style.display='grid'; const opts=[w]; while(opts.length<4){const r=currentWords[Math.floor(Math.random()*currentWords.length)];if(!opts.some(o=>o.id===r.id))opts.push(r);} shuffleArray(opts); opts.forEach(o=>{const b=document.createElement('button');b.className='option-btn';b.innerText=o.meaning;b.onclick=()=>checkObjTest(o,w);grid.appendChild(b);}); }
}
function checkTestAnswer() { const q=testQueue[currentIndex]; if(q.t==='obj') return; const v=document.getElementById('test-input').value.trim(); if(v.toLowerCase()===q.w.english.toLowerCase()){ playCorrectSound(); document.getElementById('test-feedback').innerText="정답!"; document.getElementById('test-feedback').style.color='green'; } else { document.getElementById('test-feedback').innerText=`땡! 정답: ${q.w.english}`; document.getElementById('test-feedback').style.color='red'; if(!testWrongAnswers.some(x=>x.id===q.w.id)) testWrongAnswers.push(q.w); } setTimeout(()=>{if(currentIndex<testQueue.length-1){currentIndex++;loadTestQuestion();}else showTestResult();},1000); }
function checkObjTest(s,c) { const btns=document.querySelectorAll('#test-options-grid .option-btn'); btns.forEach(b=>b.onclick=null); if(s.id===c.id){ playCorrectSound(); document.getElementById('test-feedback').innerText="정답!"; document.getElementById('test-feedback').style.color='green'; } else { document.getElementById('test-feedback').innerText=`땡! 정답: ${c.meaning}`; document.getElementById('test-feedback').style.color='red'; if(!testWrongAnswers.some(x=>x.id===c.id)) testWrongAnswers.push(c); } setTimeout(()=>{if(currentIndex<testQueue.length-1){currentIndex++;loadTestQuestion();}else showTestResult();},1000); }
function showTestResult() {
    showSection('test-result-section');
    playTestFinishSound();
    const score = Math.round(((testQueue.length - testWrongAnswers.length)/testQueue.length)*100);
    document.getElementById('test-final-score').innerText = score;
    const wrongText = testWrongAnswers.map(w=>w.english).join(', ');
    const duration = Math.floor((Date.now() - studyStartTime) / 1000);
    pendingSubmission = { type:'test', score, wrongCount:testWrongAnswers.length, wrongWordsText:wrongText, duration, tryCount:sessionRetryCount+1 };
    const btn=document.getElementById('test-submit-btn'); const msg=document.getElementById('test-submit-msg');
    if(score<=70) { btn.disabled=true; btn.classList.add('btn-disabled'); btn.innerText="제출 불가 🚫"; } else { btn.disabled=false; btn.classList.remove('btn-disabled'); btn.innerText="네! 제출할게요 ✅"; }
    const div=document.getElementById('test-wrong-word-list'); div.innerHTML='';
    if(testWrongAnswers.length>0) { document.getElementById('test-wrong-list-area').classList.remove('hidden'); testWrongAnswers.forEach(w=>{ div.innerHTML+=`<div class="wrong-item"><span class="wrong-en">${w.english}</span><span class="wrong-ko">${w.meaning}</span></div>`; }); } else document.getElementById('test-wrong-list-area').classList.add('hidden');
}
function startRetryTest() { if(testWrongAnswers.length===0) return startTest(); sessionRetryCount++; studyStartTime=Date.now(); testQueue=testWrongAnswers.map(w=>({w,t:'sub'})); shuffleArray(testQueue); testWrongAnswers=[]; currentIndex=0; alert("틀린 문제 재도전!"); showSection('test-section'); loadTestQuestion(); }

// --- 종료 ---
async function finishGame(type, score) {
    stopGame(); isStudyActive = false; 
    showSection('game-result-section'); document.getElementById('game-final-score').innerText=score;
    const nextBtn = document.getElementById('btn-next-step');
    if(type==='game_rain_clear') { playYeahSound(); triggerConfetti(); nextBtn.style.display='inline-block'; type='game_rain'; }
    else if(type==='game_monster') { playYeahSound(); triggerConfetti(); nextBtn.style.display='inline-block'; }
    else if(type==='game_monster_fail') { nextBtn.style.display='none'; }
    else { nextBtn.style.display='inline-block'; if(score>=500) playYeahSound(); }

    const replayBtn=document.getElementById('btn-replay-game');
    if(type==='game_memory') replayBtn.onclick=startMemoryGame; else if(type==='game_rain') replayBtn.onclick=startWordRain; else if(type.includes('game_monster')) replayBtn.onclick=startMonsterGame;
    
    const duration = Math.floor((Date.now() - studyStartTime) / 1000);
    await saveRecord(type, score, 0, '', duration, 1); 
    const res = await fetch(`${API_URL}/rankings?game_type=${type.replace('_fail', '')}`); const ranks=await res.json();
    const div=document.getElementById('ranking-container'); div.innerHTML='';
    ranks.forEach((r,i)=>{ div.innerHTML+=`<div class="ranking-item"><span>${i+1}. ${r.who}</span><b>${r.score}</b></div>`; });
}
function stopGame() { 
    if(gameTimer) clearInterval(gameTimer); 
    if(rainInterval) clearInterval(rainInterval); 
    monsterBgm.pause(); monsterBgm.currentTime = 0;
}
function showSection(id) { document.querySelectorAll('.container > div').forEach(d=>d.classList.add('hidden')); document.getElementById(id).classList.remove('hidden'); }
function backToDashboard() { stopGame(); isStudyActive = false; showSection('dashboard-section'); }
function goBackToSelection() { showSection('selection-section'); }
function addEnterListener(id, action) { const el=document.getElementById(id); if(el) el.addEventListener('keydown',e=>{if(e.key==='Enter')action();}); }
addEnterListener('spell-input', checkSpelling); addEnterListener('password', login); addEnterListener('username', login); addEnterListener('test-input', checkTestAnswer);
document.addEventListener('keydown', function(event) {
    const flashSection = document.getElementById('flashcard-section');
    if (!flashSection.classList.contains('hidden')) {
        if (event.code === 'Space') { event.preventDefault(); flipCard(); }
        if (event.code === 'Enter') { event.preventDefault(); nextCard(); }
        if (event.code === 'ArrowLeft') prevCard();
        if (event.code === 'ArrowRight') nextCard();
    }
});