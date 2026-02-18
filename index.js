const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

app.use(express.static('public'));

// =======================================================
// ▼▼▼ 키 설정 (이 부분을 꼭 확인하세요!) ▼▼▼
// =======================================================
const supabaseUrl = 'https://cbnldlmwsdzptniumokd.supabase.co';
const supabaseKey = 'sb_publishable_-qAdnli9EsT1-iKCOEKyMw_f50-rp8i';

// 1. 노션 API 키 (기존 키 유지)
const NOTION_KEY = 'ntn_O24683962583p89EYlVuyYlC4cHGMUbYhF7zF2SizDqb0C'; 

// 2. [기존] 점수 기록용 DB 아이디 (점수가 쌓이는 곳)
const NOTION_SCORE_DB_ID = '25409320bce2807697ede3f1c1b62ada';      

// 3. ★ [신규] 학생 명단 관리용 DB 아이디 (여기에 ID를 넣어주세요!)
// 필수 컬럼: 이름(제목), 아이디(텍스트), 비밀번호(텍스트), 교재1(선택), 교재2(선택), 교재3(선택)
const NOTION_STUDENT_DB_ID = '1bd09320bce280469301cb31c74e2557'; 
// =======================================================

const supabase = createClient(supabaseUrl, supabaseKey);

// 노션 API 호출 헬퍼
async function callNotion(endpoint, method, body) {
  const response = await fetch(`https://api.notion.com/v1${endpoint}`, {
    method: method,
    headers: {
      'Authorization': `Bearer ${NOTION_KEY}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28' 
    },
    body: JSON.stringify(body)
  });
  return await response.json();
}

function getNotionProperty(prop) {
    if (!prop) return "";
    if (prop.type === 'rich_text') return prop.rich_text?.[0]?.plain_text || "";
    if (prop.type === 'title') return prop.title?.[0]?.plain_text || "";
    if (prop.type === 'select') return prop.select?.name || "";
    return "";
}

// 1. 로그인 (노션 학생 DB 연동)
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  
  if(username === 'admin' && password === '1234') {
      return res.json({ message: '성공', student_name: '관리자', books: [] });
  }

  try {
    const response = await callNotion(`/databases/${NOTION_STUDENT_DB_ID}/query`, 'POST', {
        filter: {
            and: [
                { property: '아이디', rich_text: { equals: username } },
                { property: '비밀번호', rich_text: { equals: password } }
            ]
        }
    });

    if (response.results.length > 0) {
        const page = response.results[0];
        const name = getNotionProperty(page.properties['이름']) || "학생";
        
        // 교재 정보 가져오기
        const books = [];
        const b1 = getNotionProperty(page.properties['교재1']); if(b1) books.push(b1);
        const b2 = getNotionProperty(page.properties['교재2']); if(b2) books.push(b2);
        const b3 = getNotionProperty(page.properties['교재3']); if(b3) books.push(b3);

        res.json({ message: '성공', student_name: name, books: books });
    } else {
        res.status(401).json({ message: '아이디 또는 비밀번호를 확인하세요.' });
    }
  } catch (e) {
      console.error(e);
      res.status(500).json({ message: '노션 연동 오류 (DB ID를 확인하세요)' });
  }
});

// 2. 책 목록 (Supabase)
app.get('/books', async (req, res) => {
  const { data, error } = await supabase.from('words_original').select('book_name');
  if (error) return res.status(400).json({ error: error.message });
  const uniqueBooks = [...new Set(data.map(item => item.book_name))].sort();
  res.json(uniqueBooks);
});

// 3. 유닛 목록 (Supabase)
app.get('/units', async (req, res) => {
  const { book_name } = req.query;
  if (!book_name) return res.status(400).json({ error: '책 이름 필요' });
  const { data, error } = await supabase.from('words_original').select('unit_name').eq('book_name', book_name);
  if (error) return res.status(400).json({ error: error.message });
  const uniqueUnits = [...new Set(data.map(item => item.unit_name))].sort();
  res.json(uniqueUnits);
});

// 4. 학습 시작 (Supabase)
app.post('/start-learning', async (req, res) => {
  const { book_name, unit_name } = req.body;
  let query = supabase.from('words_original').select('*').eq('book_name', book_name).eq('unit_name', unit_name).order('word_no', { ascending: true });
  if (unit_name && unit_name.toUpperCase().includes('DAY 01')) query = query.limit(5);
  const { data, error } = await query;
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// 5. 점수 저장 (Supabase + 노션 점수 DB)
app.post('/save-score', async (req, res) => {
  const { student_name, book_name, unit_name, study_type, score, wrong_count, wrong_words } = req.body;
  const today = new Date().toISOString().split('T')[0];

  try {
    // 1) 대시보드 통계용 Supabase 저장
    await supabase.from('study_records').insert({
      who: student_name, what: `${book_name} - ${unit_name}`, which: study_type,
      score: score, wrong_count: wrong_count, wrong_words: wrong_words, when: new Date()
    });

    if (study_type.includes('game')) return res.json({ message: "게임 점수 저장 완료" });
    if (study_type !== 'test') return res.json({ message: "Supabase 저장 완료" });

    // 2) 노션 점수판 업데이트
    const response = await callNotion(`/databases/${NOTION_SCORE_DB_ID}/query`, 'POST', {
      filter: { and: [{ property: '이름', title: { equals: student_name } }, { property: '🕐 날짜', date: { equals: today } }] }
    });

    let propertiesPayload = {};
    if (response.results.length > 0) {
      const page = response.results[0];
      const currentBook1 = getNotionProperty(page.properties['단어교재1']);
      const currentBook2 = getNotionProperty(page.properties['단어교재2']);
      let slotSuffix = (currentBook1 === "" || currentBook1 === book_name) ? "1" : (currentBook2 === "" || currentBook2 === book_name) ? "2" : null;

      if (!slotSuffix) return res.json({ message: "Notion 슬롯 초과" });

      propertiesPayload[`단어교재${slotSuffix}`] = { rich_text: [{ text: { content: book_name } }] };
      propertiesPayload[`단어유닛${slotSuffix}`] = { rich_text: [{ text: { content: unit_name } }] };
      propertiesPayload[`테스트점수${slotSuffix}`] = { number: score }; 
      propertiesPayload[`테스트오답${slotSuffix}`] = { rich_text: [{ text: { content: wrong_words || "-" } }] }; 

      await callNotion(`/pages/${page.id}`, 'PATCH', { properties: propertiesPayload });
    } else {
      propertiesPayload = {
        '이름': { title: [{ text: { content: student_name } }] },
        '🕐 날짜': { date: { start: today } },
        '단어교재1': { rich_text: [{ text: { content: book_name } }] },
        '단어유닛1': { rich_text: [{ text: { content: unit_name } }] },
        '테스트점수1': { number: score },
        '테스트오답1': { rich_text: [{ text: { content: wrong_words || "-" } }] }
      };
      await callNotion(`/pages`, 'POST', { parent: { database_id: NOTION_SCORE_DB_ID }, icon: { type: "emoji", emoji: "📱" }, properties: propertiesPayload });
    }
    res.json({ message: "저장 완료" });
  } catch (error) { res.status(500).json({ error: "저장 오류" }); }
});

// 6. 랭킹
app.get('/rankings', async (req, res) => {
  const { game_type } = req.query;
  try {
    const { data } = await supabase.from('study_records').select('who, score').eq('which', game_type).order('score', { ascending: false }).limit(10);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 7. 관리자 대시보드
app.get('/admin/dashboard', async (req, res) => {
    const { start, end } = req.query;
    let startDate = start || new Date().toISOString().split('T')[0];
    let endDate = end || new Date().toISOString().split('T')[0];
    const startISO = `${startDate}T00:00:00`;
    const endISO = `${endDate}T23:59:59`;

    const { data, error } = await supabase.from('study_records').select('*').gte('when', startISO).lte('when', endISO).order('when', { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
});

// 8. 관리자 단어 업로드
app.post('/admin/bulk-upload', async (req, res) => {
    const { words } = req.body;
    if (!words || !Array.isArray(words)) return res.status(400).json({ error: '데이터 형식 오류' });
    const cleanWords = words.map(w => ({
      book_name: w.book_name, unit_name: w.unit_name, word_no: w.word_no ? parseInt(w.word_no) : 0,
      english: w.english, meaning: w.meaning, example: w.example || null, synonyms: w.synonyms || null, antonyms: w.antonyms || null
    })).filter(w => w.english && w.book_name);
    const { data, error } = await supabase.from('words_original').insert(cleanWords);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ message: '성공', count: cleanWords.length });
});

// 실시간 요청 및 승인
app.post('/test/request', async (req, res) => {
  const { student_name, book_name, unit_name } = req.body;
  const { data: existing } = await supabase.from('test_requests').select('*').eq('student_name', student_name).eq('book_name', book_name).eq('unit_name', unit_name).eq('status', 'pending').single();
  if (existing) return res.json({ message: 'already_pending' });
  const { error } = await supabase.from('test_requests').insert({ student_name, book_name, unit_name, status: 'pending' });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'requested' });
});
app.get('/test/status', async (req, res) => {
  const { student_name, book_name, unit_name } = req.query;
  const { data } = await supabase.from('test_requests').select('status').eq('student_name', student_name).eq('book_name', book_name).eq('unit_name', unit_name).order('created_at', { ascending: false }).limit(1).single();
  res.json({ status: data ? data.status : 'none' });
});
app.get('/admin/test-requests', async (req, res) => {
  const { data, error } = await supabase.from('test_requests').select('*').eq('status', 'pending').order('created_at', { ascending: true });
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});
app.post('/admin/approve-test', async (req, res) => {
  const { request_id } = req.body;
  const { error } = await supabase.from('test_requests').update({ status: 'approved' }).eq('id', request_id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'approved' });
});

// 9. ★ [NEW] 학생 목록 조회 (노션 연동)
app.get('/admin/students', async (req, res) => {
  try {
      const response = await callNotion(`/databases/${NOTION_STUDENT_DB_ID}/query`, 'POST', {
          sorts: [{ property: '이름', direction: 'ascending' }]
      });

      const students = response.results.map(page => ({
          pageId: page.id,
          name: getNotionProperty(page.properties['이름']) || "이름없음",
          username: getNotionProperty(page.properties['아이디']) || "-",
          book1: getNotionProperty(page.properties['교재1']) || "",
          book2: getNotionProperty(page.properties['교재2']) || "",
          book3: getNotionProperty(page.properties['교재3']) || ""
      }));

      res.json(students);
  } catch (e) {
      console.error(e);
      res.status(500).json({ error: "노션 학생 목록 로딩 실패" });
  }
});

// 10. ★ [NEW] 학생 교재 정보 수정 (노션 업데이트)
app.post('/admin/update-student', async (req, res) => {
    const { pageId, book1, book2, book3 } = req.body;
    
    // 선택 안 함("")이면 null, 아니면 { name: "값" } 형태로 전송
    const createSelectPayload = (val) => val ? { select: { name: val } } : { select: null };

    try {
        await callNotion(`/pages/${pageId}`, 'PATCH', {
            properties: {
                '교재1': createSelectPayload(book1),
                '교재2': createSelectPayload(book2),
                '교재3': createSelectPayload(book3)
            }
        });
        res.json({ message: '성공적으로 업데이트되었습니다.' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: '노션 업데이트 실패' });
    }
});

// 11. 교재 삭제 (Supabase)
app.post('/admin/delete-book', async (req, res) => {
    const { book_name } = req.body;
    if (!book_name) return res.status(400).json({ error: 'Book name required' });

    const { error } = await supabase
        .from('words_original')
        .delete()
        .eq('book_name', book_name);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: 'Deleted successfully' });
});

app.listen(3000, () => {
  console.log('🚀 서버가 3000번 포트에서 실행 중입니다!');
});