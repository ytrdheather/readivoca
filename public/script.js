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

// ★ 효과음: 정답 (pass.mp3)
function playCorrectSound() {
    const audio = new Audio('pass.mp3');
    audio.volume = 0.5; 
    audio.play().catch(e => console.log('사운드 재생 차단됨'));
}

// ★ 효과음: 빵빠레
function playFanfareSound() {
    const audio = new Audio('https://actions.google.com/sounds/v1/cartoon/clank_clank.ogg'); 
    audio.volume = 0.6;
    audio.play().catch(e => console.log('사운드 재생 차단됨'));
}

// ★ 폭죽 효과
function triggerConfetti() {
    if (typeof confetti === 'function') {
        var duration = 3 * 1000;
        var animationEnd = Date.now() + duration;
        var defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

        var interval = setInterval(function() {
            var timeLeft = animationEnd - Date.now();
            if (timeLeft <= 0) {
                return clearInterval(interval);
            }
            var particleCount = 50 * (timeLeft / duration);
            confetti(Object.assign({}, defaults, { particleCount, origin: { x: Math.random(), y: Math.random() - 0.2 } }));
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

// 딴짓 방지 로직 (화면 이탈 감지)
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
function tryStart(stage, startFunction) {
    if (stage > currentUnlockStage) {
        alert(`🔒 이전 단계를 먼저 완료해야 합니다!\n(현재 ${currentUnlockStage}단계 진행 중)`);
        return;
    }
    
    studyStartTime = Date.now();
    sessionRetryCount = 0; 
    blurWarningCount = 0; 
    
    // ★ [수정됨] 1(암기), 2(카드), 4(산성비), 6(몬스터)는 딴짓 방지 해제 (게임 및 단순 암기)
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
        alert(`🎉 축하합니다! ${currentUnlockStage}단계가 해제되었습니다.`);
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
    const bookName = document.getElementById('book-select').value;
    const unitName = document.getElementById('unit-select').value;
    try {
        const res = await fetch(`${API_URL}/save-score`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                student_name: currentUser, 
                book_name: bookName, 
                unit_name: unitName, 
                study_type: type, 
                score: score, 
                wrong_count: wrongCount, 
                wrong_words: wrongWordsList,
                duration: duration, 
                try_count: tryCount 
            })
        });
    } catch (err) { console.error(err); }
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
    if (pendingSubmission.score > 70) unlockNextStep(); else { alert("70점을 넘지 못해 다음 단계가 열리지 않습니다 ㅠㅠ"); backToDashboard(); }
}
async function loadBooks() { try { const res = await fetch(`${API_URL}/books`); const data = await res.json(); const s = document.getElementById('book-select'); s.innerHTML='<option value="">📚 교재 선택</option>'; data.forEach(b => { const o = document.createElement('option'); o.value=b; o.innerText=b; s.appendChild(o); }); const ts = document.getElementById('teacher-book-select'); if(ts) { ts.innerHTML='<option value="">교재 선택</option>'; data.forEach(b => { const o = document.createElement('option'); o.value=b; o.innerText=b; ts.appendChild(o); }); } } catch(e) {} }
async function loadUnits() { const b = document.getElementById('book-select').value; const s = document.getElementById('unit-select'); s.innerHTML='<option>📂 유닛 선택</option>'; s.disabled=true; if(!b) return; const res = await fetch(`${API_URL}/units?book_name=${encodeURIComponent(b)}`); const data = await res.json(); data.forEach(u => { const o = document.createElement('option'); o.value=u; o.innerText=u; s.appendChild(o); }); s.disabled=false; }

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
        updateMenuUI(); 
        
        showSection('dashboard-section'); 
    } catch(e) { alert('로드 실패'); } 
}

// 1. 암기
function startFlashcard() { showSection('flashcard-section'); currentIndex=0; loadFlashcard(0); }
function loadFlashcard(idx) {
    const w=currentWords[idx]; document.getElementById('fc-en').innerText=w.english; document.getElementById('fc-ko').innerText=w.meaning;
    const ex=document.getElementById('fc-ex'); const ext=document.getElementById('fc-ex-text'); if(w.example){ex.style.display='block';ext.innerText=w.example;ext.onclick=(e)=>{e.stopPropagation();playAudio(w.example);};}else ex.style.display='none';
    const syn=document.getElementById('fc-syn'); const synt=document.getElementById('fc-syn-text'); if(w.synonyms){syn.style.display='block';synt.innerText=w.synonyms;synt.onclick=(e)=>{e.stopPropagation();playAudio(w.synonyms);};}else syn.style.display='none';
    const ant=document.getElementById('fc-ant'); const antt=document.getElementById('fc-ant-text'); if(w.antonyms){ant.style.display='block';antt.innerText=w.antonyms;antt.onclick=(e)=>{e.stopPropagation();playAudio(w.antonyms);};}else ant.style.display='none';
    document.getElementById('flashcard').classList.remove('flipped'); isFlipped=false;
}
let isFlipped=false;
function flipCard() { document.getElementById('flashcard').classList.toggle('flipped'); isFlipped=!isFlipped; if(isFlipped) playAudio(); }
function playAudio(text) { if('speechSynthesis' in window){ window.speechSynthesis.cancel(); const content = text || currentWords[currentIndex].english; const u=new SpeechSynthesisUtterance(content); u.lang='en-US'; u.rate=0.8; window.speechSynthesis.speak(u); } }
function nextCard() { if(currentIndex<currentWords.length-1) loadFlashcard(++currentIndex); else alert("마지막입니다! '암기 완료' 버튼을 눌러주세요."); }
function prevCard() { if(currentIndex>0) loadFlashcard(--currentIndex); }
function finishFlashcard() { unlockNextStep(); }

// 2. 카드 짝맞추기
let memCards=[], flippedCards=[], matchedCount=0;
function startMemoryGame() {
    if(currentWords.length<8) { isStudyActive = false; alert("⚡ [테스트 모드] 자동 통과!"); unlockNextStep(); return; }
    showSection('memory-game-section'); gameScore=0; matchedCount=0; document.getElementById('mem-score').innerText=0; document.getElementById('mem-time').innerText=60;
    const words = [...currentWords].sort(()=>0.5-Math.random()).slice(0,8);
    memCards=[]; words.forEach((w,i)=>{ memCards.push({id:i,t:w.english}); memCards.push({id:i,t:w.meaning}); });
    memCards.sort(()=>0.5-Math.random());
    const grid=document.getElementById('memory-grid'); grid.innerHTML='';
    memCards.forEach((c,i)=>{ const el=document.createElement('div'); el.className='memory-card'; el.dataset.idx=i; el.innerText='?'; el.onclick=()=>flipMemCard(el,c); grid.appendChild(el); });
    if(gameTimer) clearInterval(gameTimer); let t=60; gameTimer=setInterval(()=>{ t--; document.getElementById('mem-time').innerText=t; if(t<=0) finishGame('game_memory',gameScore); },1000);
}
function flipMemCard(el,c) { if(el.classList.contains('flipped')||flippedCards.length>=2) return; el.classList.add('flipped'); el.innerText=c.t; flippedCards.push({el,c}); if(flippedCards.length===2) checkMatch(); }
function checkMatch() {
    const [c1,c2]=flippedCards;
    if(c1.c.id===c2.c.id) { 
        playCorrectSound(); 
        gameScore+=100; document.getElementById('mem-score').innerText=gameScore; c1.el.classList.add('matched'); c2.el.classList.add('matched'); matchedCount++; flippedCards=[]; if(matchedCount===8) finishGame('game_memory',gameScore+500); 
    }
    else { setTimeout(()=>{ c1.el.classList.remove('flipped'); c1.el.innerText='?'; c2.el.classList.remove('flipped'); c2.el.innerText='?'; flippedCards=[]; },1000); }
}

// 3. 반복 훈련 (Context Quiz)
function startContextQuiz() { 
    showSection('quiz-section'); 
    quizQueue=[]; quizWrongAnswers=[]; 
    currentWords.forEach(w=>{ 
        quizQueue.push({w,t:'meaning'}); 
        if(w.example) quizQueue.push({w,t:'example'}); else quizQueue.push({w,t:'meaning'}); 
        if(w.synonyms||w.antonyms) {
            let qType = (w.synonyms&&w.antonyms)?(Math.random()>0.5?'synonym':'antonym'):(w.synonyms?'synonym':'antonym');
            quizQueue.push({w,t:qType});
        } else quizQueue.push({w,t:'meaning'}); 
    }); 
    shuffleArray(quizQueue); 
    const TEST_LIMIT = 5; if(quizQueue.length > TEST_LIMIT) quizQueue = quizQueue.slice(0, TEST_LIMIT); 
    currentIndex=0; loadQuizQuestion(); 
}
function maskWordInSentence(sentence, word) { if (!sentence || !word) return ""; const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); const safeWord = escapeRegExp(word); const variations = [safeWord]; if (word.endsWith('y')) { const root = word.slice(0, -1); variations.push(escapeRegExp(root) + "ied"); variations.push(escapeRegExp(root) + "ies"); variations.push(escapeRegExp(word) + "ing"); } else if (word.endsWith('e')) { const root = word.slice(0, -1); variations.push(escapeRegExp(root) + "ing"); variations.push(escapeRegExp(word) + "d"); variations.push(escapeRegExp(word) + "s"); } else { variations.push(escapeRegExp(word) + "s"); variations.push(escapeRegExp(word) + "ed"); variations.push(escapeRegExp(word) + "ing"); } const pattern = new RegExp(`\\b(${variations.join('|')})\\b`, 'gi'); let masked = sentence.replace(pattern, "_______"); if (masked === sentence) { masked = sentence.replace(new RegExp(safeWord, 'gi'), "_______"); } return masked; }
function loadQuizQuestion() {
    const q=quizQueue[currentIndex]; const w=q.w; const box=document.getElementById('quiz-question'); const badge=document.getElementById('quiz-type-badge');
    
    // 글씨 크기 1.3rem
    box.style.fontSize = '1.3rem'; 
    
    if(q.t==='example') { box.innerText=maskWordInSentence(w.example, w.english); badge.innerText="빈칸에 들어갈 말은? (Example)"; } else if(q.t==='synonym') { box.innerText=w.synonyms; badge.innerText="유의어는?"; } else if(q.t==='antonym') { box.innerText=w.antonyms; badge.innerText="반의어는?"; } else { box.innerText=w.meaning; badge.innerText="이 뜻의 영어 단어는?"; }
    const opts=[w]; while(opts.length<4) { const r=currentWords[Math.floor(Math.random()*currentWords.length)]; if(!opts.some(o=>o.id===r.id)) opts.push(r); } shuffleArray(opts);
    const grid=document.getElementById('quiz-options'); grid.innerHTML='';
    opts.forEach(o=>{ const b=document.createElement('button'); b.className='option-btn'; b.innerText=o.english; 
        b.onclick=()=>{ 
            if(o.id===w.id) { 
                playCorrectSound(); 
                b.classList.add('correct'); setTimeout(()=>{ if(currentIndex<quizQueue.length-1){currentIndex++;loadQuizQuestion();} else showQuizResult(); },800); 
            } else { b.classList.add('wrong'); if(!quizWrongAnswers.some(x=>x.id===w.id)) quizWrongAnswers.push(w); } 
        }; grid.appendChild(b); 
    });
    document.getElementById('quiz-progress').innerText = `${currentIndex+1}/${quizQueue.length}`;
}
function showQuizResult() {
    showSection('quiz-result-section');
    const score = Math.round(((quizQueue.length - quizWrongAnswers.length)/quizQueue.length)*100);
    document.getElementById('quiz-final-score').innerText = score;
    const wrongText = quizWrongAnswers.map(w=>w.english).join(', ');
    
    const duration = Math.floor((Date.now() - studyStartTime) / 1000);

    pendingSubmission = { 
        type:'quiz', score:score, wrongCount:quizWrongAnswers.length, wrongWordsText:wrongText,
        duration: duration, 
        tryCount: sessionRetryCount + 1 
    };
    
    const btn = document.getElementById('quiz-submit-btn'); const msg = document.getElementById('quiz-submit-msg');
    if(score<=70) { btn.disabled=true; btn.classList.add('btn-disabled'); btn.innerText="제출 불가 🚫"; msg.innerText="70점 이하는 제출 불가!"; msg.style.color="#dc3545"; } else { btn.disabled=false; btn.classList.remove('btn-disabled'); btn.innerText="제출하기 ✅"; msg.innerText="점수를 보낼까요?"; msg.style.color="#28a745"; }
    const div = document.getElementById('quiz-wrong-word-list'); div.innerHTML='';
    if(quizWrongAnswers.length>0) { document.getElementById('quiz-wrong-list-area').classList.remove('hidden'); quizWrongAnswers.forEach(w=>{ div.innerHTML+=`<div class="wrong-item"><span class="wrong-en">${w.english}</span><span class="wrong-ko">${w.meaning}</span></div>`; }); } else document.getElementById('quiz-wrong-list-area').classList.add('hidden');
}
function startRetryQuiz() { if(quizWrongAnswers.length===0) return startContextQuiz(); quizQueue=[]; quizWrongAnswers.forEach(w=>quizQueue.push({w,t:'meaning'})); quizWrongAnswers=[]; shuffleArray(quizQueue); currentIndex=0; alert("틀린 문제 재도전!"); showSection('quiz-section'); loadQuizQuestion(); }

// 4. 단어 산성비
function startWordRain() {
    showSection('word-rain-section'); gameScore=0; rainWords=[]; let life=3; document.getElementById('rain-score').innerText=0; document.getElementById('rain-life').innerText="❤️❤️❤️";
    
    // ★ [NEW] 2000점 버튼 초기화 (숨김)
    document.getElementById('btn-rain-early-exit').classList.add('hidden');
    
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
                
                // 맞추면 뜻으로 변신!
                target.el.innerText = target.meaning; 
                target.el.style.color='#ffeb3b';      
                target.el.style.transform='scale(1.3)';
                target.el.style.textShadow='0 0 10px #ff9800'; 
                
                setTimeout(()=>target.el.remove(), 500); 
                
                gameScore+=50; 
                document.getElementById('rain-score').innerText=gameScore; 

                // ★ [NEW] 2000점 넘으면 '그만하기' 버튼 보여주기
                if(gameScore >= 2000) {
                    document.getElementById('btn-rain-early-exit').classList.remove('hidden');
                }

                // ★ 4000점 클리어 조건 체크
                if(gameScore >= 4000) {
                    finishGame('game_rain_clear', gameScore); // 클리어 타입 전달
                }

                e.target.value=''; 
                playCorrectSound();
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
        playCorrectSound(); 
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
    
    // ★ 시간 & 횟수
    const duration = Math.floor((Date.now() - studyStartTime) / 1000);
    
    pendingSubmission = { 
        type:'spelling', score:score, wrongCount:wrongAnswers.length, wrongWordsText:wrongText,
        duration: duration,
        tryCount: sessionRetryCount + 1
    };
    
    const btn = document.getElementById('spell-submit-btn'); const msg = document.getElementById('spell-submit-msg');
    if(score<=70) { btn.disabled=true; btn.classList.add('btn-disabled'); btn.innerText="제출 불가 🚫"; msg.innerText="70점 이하는 제출 불가!"; msg.style.color="#dc3545"; } else { btn.disabled=false; btn.classList.remove('btn-disabled'); btn.innerText="네! 제출할게요 ✅"; msg.innerText="훌륭해요! 점수를 보낼까요?"; msg.style.color="#28a745"; }
    const div = document.getElementById('spell-wrong-word-list'); div.innerHTML='';
    if(wrongAnswers.length>0) { document.getElementById('spell-wrong-list-area').classList.remove('hidden'); wrongAnswers.forEach(w=>{ div.innerHTML+=`<div class="wrong-item"><span class="wrong-en">${w.english}</span><span class="wrong-ko">${w.meaning}</span></div>`; }); } else document.getElementById('spell-wrong-list-area').classList.add('hidden');
}
function startRetrySpelling() { if(wrongAnswers.length===0) return startSpelling(); spellingList=[...wrongAnswers]; shuffleArray(spellingList); wrongAnswers=[]; currentIndex=0; alert("틀린 단어 재도전!"); showSection('spelling-section'); loadSpellingQuestion(); }

// 6. 단어 몬스터
function startMonsterGame() {
    // [수정됨] 단어 부족 시 자동 패스 처리 & 딴짓 감지 방지
    if(currentWords.length < 10) {
        isStudyActive = false; // 경고창 뜰 때 딴짓 감지 끄기
        alert("⚡ [테스트 모드] 단어가 부족하여(10개 미만) 자동으로 통과됩니다! 🎉");
        unlockNextStep();
        return;
    }

    showSection('monster-game-section'); gameScore=0; monsterHp=100; playerHp=100; monsterIndex=0;
    document.getElementById('monster-hp').style.width='100%'; document.getElementById('monster-hp-text').innerText='100';
    document.getElementById('player-hp').style.width='100%'; document.getElementById('player-hp-text').innerText='100'; document.getElementById('player-img').innerText='😊';
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
function hitMonster() { monsterHp -= 10; document.getElementById('monster-hp').style.width = monsterHp+'%'; document.getElementById('monster-hp-text').innerText = monsterHp; gameScore += 100; const monsterImg = document.getElementById('monster-img'); monsterImg.classList.add('shake-anim'); setTimeout(()=>monsterImg.classList.remove('shake-anim'), 500); const dmg = document.getElementById('monster-damage'); dmg.classList.remove('hidden'); dmg.innerText = "-10"; setTimeout(()=>dmg.classList.add('hidden'), 500); const msg = document.getElementById('monster-msg'); msg.classList.remove('hidden'); setTimeout(()=>msg.classList.add('hidden'), 500); }
function hitPlayer() { playerHp -= 20; document.getElementById('player-hp').style.width = Math.max(0, playerHp) + '%'; document.getElementById('player-hp-text').innerText = Math.max(0, playerHp); const playerImg = document.getElementById('player-img'); playerImg.innerText = '😭'; playerImg.classList.add('shake-anim'); setTimeout(()=> { playerImg.classList.remove('shake-anim'); if(playerHp > 0) playerImg.innerText = '😊'; }, 500); const dmg = document.getElementById('player-damage'); dmg.classList.remove('hidden'); dmg.innerText = "-20"; setTimeout(()=>dmg.classList.add('hidden'), 500); const msg = document.getElementById('player-msg'); msg.classList.remove('hidden'); setTimeout(()=>msg.classList.add('hidden'), 500); if(playerHp <= 0) setTimeout(() => finishGame('game_monster_fail', gameScore), 500); }

// 7. 실전 테스트
let testQueue = [];
let testWrongAnswers = [];

function startTest() {
    showSection('test-section');
    currentIndex = 0;
    testWrongAnswers = [];
    isCurrentWordWrong = false;
    
    let part1 = currentWords.map(w => ({ word: w, type: 'subjective' })); shuffleArray(part1);
    let part2 = currentWords.map(w => ({ word: w, type: 'objective' })); shuffleArray(part2);
    testQueue = [...part1, ...part2];
    
    loadTestQuestion();
}

function loadTestQuestion() {
    const q = testQueue[currentIndex];
    const w = q.word;

    document.getElementById('test-progress').innerText = `${currentIndex + 1} / ${testQueue.length}`;
    document.getElementById('test-feedback').innerText = '';

    const questionBox = document.getElementById('test-question');
    const inputField = document.getElementById('test-input');
    const submitBtn = document.querySelector('#test-section .btn-primary'); 
    
    let optionGrid = document.getElementById('test-options-grid');
    if (!optionGrid) {
        optionGrid = document.createElement('div');
        optionGrid.id = 'test-options-grid';
        optionGrid.className = 'option-grid';
        questionBox.parentNode.insertBefore(optionGrid, questionBox.nextSibling);
    }
    optionGrid.innerHTML = ''; 

    if (q.type === 'subjective') {
        questionBox.innerText = w.meaning;
        questionBox.style.fontSize = "1.4rem"; 
        
        inputField.style.display = 'block';
        submitBtn.style.display = 'block';
        optionGrid.style.display = 'none'; 
        
        inputField.value = '';
        inputField.focus();
        
    } else {
        questionBox.innerText = w.english;
        questionBox.style.fontSize = "3rem"; 
        
        inputField.style.display = 'none';
        submitBtn.style.display = 'none';
        optionGrid.style.display = 'grid'; 

        const opts = [w];
        while(opts.length < 4) {
            const r = currentWords[Math.floor(Math.random() * currentWords.length)];
            if(!opts.some(o => o.id === r.id)) opts.push(r);
        }
        shuffleArray(opts);

        opts.forEach(o => {
            const b = document.createElement('button');
            b.className = 'option-btn';
            b.innerText = o.meaning; 
            b.onclick = () => checkObjectiveAnswer(o, w); 
            optionGrid.appendChild(b);
        });
    }
}

function checkTestAnswer() {
    const q = testQueue[currentIndex];
    if (q.type === 'objective') return;

    const input = document.getElementById('test-input').value.trim();
    const w = q.word;
    
    if (input.toLowerCase() === w.english.toLowerCase()) {
        playCorrectSound();
        document.getElementById('test-feedback').innerText = "정답!";
        document.getElementById('test-feedback').style.color = 'green';
    } else {
        document.getElementById('test-feedback').innerText = `땡! 정답: ${w.english}`;
        document.getElementById('test-feedback').style.color = 'red';
        if (!testWrongAnswers.some(x => x.id === w.id)) testWrongAnswers.push(w);
    }
    goNextTest();
}

function checkObjectiveAnswer(selected, correct) {
    const btns = document.querySelectorAll('#test-options-grid .option-btn');
    btns.forEach(b => b.onclick = null);

    if (selected.id === correct.id) {
        playCorrectSound();
        document.getElementById('test-feedback').innerText = "정답!";
        document.getElementById('test-feedback').style.color = 'green';
    } else {
        document.getElementById('test-feedback').innerText = `땡! 정답: ${correct.meaning}`;
        document.getElementById('test-feedback').style.color = 'red';
        if (!testWrongAnswers.some(x => x.id === correct.id)) testWrongAnswers.push(correct);
    }
    goNextTest();
}

function goNextTest() {
    setTimeout(() => {
        if (currentIndex < testQueue.length - 1) {
            currentIndex++;
            loadTestQuestion();
        } else {
            showTestResult();
        }
    }, 1000);
}

function showTestResult() {
    showSection('test-result-section');
    const total = testQueue.length; 
    const wrong = testWrongAnswers.length;
    const score = Math.round(((total - wrong) / total) * 100);
    
    document.getElementById('test-final-score').innerText = score;
    const wrongText = testWrongAnswers.map(w => w.english).join(', ');
    
    // ★ 시간 & 횟수
    const duration = Math.floor((Date.now() - studyStartTime) / 1000);

    pendingSubmission = { 
        type: 'test', score: score, wrongCount: wrong, wrongWordsText: wrongText,
        duration: duration,
        tryCount: sessionRetryCount + 1
    };
    
    const btn = document.getElementById('test-submit-btn'); 
    const msg = document.getElementById('test-submit-msg');
    
    if (score <= 70) { 
        btn.disabled = true; btn.classList.add('btn-disabled'); 
        btn.innerText = "제출 불가 🚫"; 
        msg.innerText = "70점 이하는 통과할 수 없습니다."; 
        msg.style.color = "#dc3545"; 
    } else { 
        btn.disabled = false; btn.classList.remove('btn-disabled'); 
        btn.innerText = "네! 제출할게요 ✅"; 
        msg.innerText = "축하합니다! 테스트를 통과했습니다."; 
        msg.style.color = "#28a745"; 
    }
    
    const div = document.getElementById('test-wrong-word-list'); div.innerHTML = '';
    if (testWrongAnswers.length > 0) { 
        document.getElementById('test-wrong-list-area').classList.remove('hidden'); 
        testWrongAnswers.forEach(w => { 
            div.innerHTML += `<div class="wrong-item"><span class="wrong-en">${w.english}</span><span class="wrong-ko">${w.meaning}</span></div>`; 
        }); 
    } else { 
        document.getElementById('test-wrong-list-area').classList.add('hidden'); 
    }
}

function startRetryTest() { 
    if (testWrongAnswers.length === 0) { startTest(); return; } 
    
    sessionRetryCount++;
    studyStartTime = Date.now();

    testQueue = testWrongAnswers.map(w => ({ word: w, type: 'subjective' }));
    shuffleArray(testQueue);
    
    testWrongAnswers = []; 
    currentIndex = 0; 
    alert("틀린 문제만 주관식으로 집중 공략합니다! 🔥"); 
    showSection('test-section'); 
    loadTestQuestion(); 
}

// --- 공통 게임 종료 (★ 산성비 클리어 로직 추가됨) ---
async function finishGame(type, score) {
    stopGame(); isStudyActive = false; // 게임 종료 시 딴짓 감지 해제
    showSection('game-result-section'); document.getElementById('game-final-score').innerText=score;
    const nextBtn = document.getElementById('btn-next-step');
    
    // 산성비 클리어 시 효과
    if (type === 'game_rain_clear') {
        document.getElementById('game-result-title').innerText = "Mission Complete!";
        document.getElementById('game-result-title').style.color = "#00bcd4";
        nextBtn.style.display = 'inline-block';
        playFanfareSound(); // 🔔 빵빠레
        triggerConfetti();  // 🎉 폭죽
        type = 'game_rain'; // 저장할 땐 원래 타입으로
    } 
    else if (type === 'game_monster_fail') { 
        document.getElementById('game-result-title').innerText = "패배... ㅠㅠ"; 
        document.getElementById('game-result-title').style.color = "red"; 
        nextBtn.style.display = 'none'; 
    } 
    else { 
        document.getElementById('game-result-title').innerText = "Game Over!"; 
        document.getElementById('game-result-title').style.color = "#ff9800"; 
        nextBtn.style.display = 'inline-block'; 
    }
    
    const replayBtn = document.getElementById('btn-replay-game');
    if(type==='game_memory') replayBtn.onclick = startMemoryGame; else if(type==='game_rain') replayBtn.onclick = startWordRain; else if(type.includes('game_monster')) replayBtn.onclick = startMonsterGame;
    
    const duration = Math.floor((Date.now() - studyStartTime) / 1000);
    await saveRecord(type, score, 0, '', duration, 1); 
    
    const res = await fetch(`${API_URL}/rankings?game_type=${type.replace('_fail', '')}`); const ranks=await res.json();
    const div=document.getElementById('ranking-container'); div.innerHTML='';
    ranks.forEach((r,i)=>{ div.innerHTML+=`<div class="ranking-item"><span>${i===0?'🥇':i===1?'🥈':i===2?'🥉':''} ${i+1}. ${r.who}</span><b>${r.score}</b></div>`; });
}

function stopGame() { if(gameTimer) clearInterval(gameTimer); if(rainInterval) clearInterval(rainInterval); }
function startTestWait() { alert("시험 모드 준비중!"); }
function initTeacherView() { loadBooks(); }
function renderTeacherTable() {}
function printTestPaper() {}
function showGameZone() { /* deprecated */ }
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