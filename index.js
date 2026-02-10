const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

app.use(express.static('public'));

// =======================================================
// ▼▼▼ 키 설정 ▼▼▼
// =======================================================
const supabaseUrl = 'https://cbnldlmwsdzptniumokd.supabase.co';
const supabaseKey = 'sb_publishable_-qAdnli9EsT1-iKCOEKyMw_f50-rp8i';
const NOTION_KEY = 'ntn_O24683962583p89EYlVuyYlC4cHGMUbYhF7zF2SizDqb0C'; 
const NOTION_DB_ID = '25409320bce2807697ede3f1c1b62ada';      
// =======================================================

const supabase = createClient(supabaseUrl, supabaseKey);

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

// 1. 로그인
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  
  // 관리자 프리패스
  if(username === 'admin' && password === '1234') {
      return res.json({ message: '성공', student_name: '관리자', book_name: '' });
  }

  const { data, error } = await supabase
    .from('students')
    .select('*')
    .eq('username', username)
    .eq('password', password)
    .single();

  if (error || !data) return res.status(401).json({ message: '로그인 실패' });
  
  res.json({ 
    message: '성공', 
    student_name: data.name, 
    book_name: data.assigned_book 
  });
});

// 2. 책 목록
app.get('/books', async (req, res) => {
  const { data, error } = await supabase.from('words_original').select('book_name');
  if (error) return res.status(400).json({ error: error.message });
  const uniqueBooks = [...new Set(data.map(item => item.book_name))];
  res.json(uniqueBooks);
});

// 3. 유닛 목록
app.get('/units', async (req, res) => {
  const { book_name } = req.query;
  if (!book_name) return res.status(400).json({ error: '책 이름 필요' });
  const { data, error } = await supabase.from('words_original').select('unit_name').eq('book_name', book_name);
  if (error) return res.status(400).json({ error: error.message });
  const uniqueUnits = [...new Set(data.map(item => item.unit_name))].sort();
  res.json(uniqueUnits);
});

// 4. 학습 시작
app.post('/start-learning', async (req, res) => {
  const { book_name, unit_name } = req.body;

  let query = supabase
    .from('words_original')
    .select('*')
    .eq('book_name', book_name)
    .eq('unit_name', unit_name)
    .order('word_no', { ascending: true });

  if (unit_name && unit_name.toUpperCase().includes('DAY 01')) {
    query = query.limit(5);
  }

  const { data, error } = await query;
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// 5. 점수 저장 & 노션
app.post('/save-score', async (req, res) => {
  const { student_name, book_name, unit_name, study_type, score, wrong_count, wrong_words, duration, try_count } = req.body;
  const today = new Date().toISOString().split('T')[0];

  try {
    await supabase.from('study_records').insert({
      who: student_name, what: `${book_name} - ${unit_name}`, which: study_type,
      score: score, wrong_count: wrong_count, wrong_words: wrong_words, when: new Date()
    });

    if (study_type.includes('game')) return res.json({ message: "게임 점수 저장 완료" });

    // 테스트가 아니면 노션 전송 생략
    if (study_type !== 'test') return res.json({ message: "Supabase 저장 완료" });

    const response = await notion.databases.query({
      database_id: NOTION_DB_ID,
      filter: { and: [{ property: '이름', title: { equals: student_name } }, { property: '🕐 날짜', date: { equals: today } }] }
    });

    // 노션 업데이트 로직
    let propertiesPayload = {};
    if (response.results.length > 0) {
      const page = response.results[0];
      const currentBook1 = page.properties['단어교재1']?.rich_text?.[0]?.plain_text || "";
      const currentBook2 = page.properties['단어교재2']?.rich_text?.[0]?.plain_text || "";
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
      await callNotion(`/pages`, 'POST', { parent: { database_id: NOTION_DB_ID }, icon: { type: "emoji", emoji: "📱" }, properties: propertiesPayload });
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

// 7. 관리자 API들 (대시보드, 업로드)
app.get('/admin/dashboard', async (req, res) => {
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];
    const start = `${targetDate}T00:00:00`;
    const end = `${targetDate}T23:59:59`;
    const { data, error } = await supabase.from('study_records').select('*').gte('when', start).lte('when', end).order('when', { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
});
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
app.get('/admin/search', async (req, res) => {
    const { keyword } = req.query;
    if (!keyword) return res.json([]);
    const { data, error } = await supabase.from('words_original').select('*').or(`english.ilike.%${keyword}%,meaning.ilike.%${keyword}%`).limit(50);
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
});
app.post('/admin/update-word', async (req, res) => {
    const { id, english, meaning, example, synonyms, antonyms } = req.body;
    const { data, error } = await supabase.from('words_original').update({ english, meaning, example, synonyms, antonyms }).eq('id', id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ message: "수정 완료!" });
});

// ★ [NEW] 실시간 시험 요청/승인 시스템 API
app.post('/test/request', async (req, res) => {
  const { student_name, book_name, unit_name } = req.body;
  const { data: existing } = await supabase
    .from('test_requests').select('*')
    .eq('student_name', student_name).eq('book_name', book_name).eq('unit_name', unit_name).eq('status', 'pending').single();

  if (existing) return res.json({ message: 'already_pending' });

  const { error } = await supabase.from('test_requests').insert({ student_name, book_name, unit_name, status: 'pending' });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'requested' });
});

app.get('/test/status', async (req, res) => {
  const { student_name, book_name, unit_name } = req.query;
  const { data } = await supabase.from('test_requests').select('status')
    .eq('student_name', student_name).eq('book_name', book_name).eq('unit_name', unit_name)
    .order('created_at', { ascending: false }).limit(1).single();
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

// ★ [NEW] 8. 학생 목록 조회 (관리자용)
app.get('/admin/students', async (req, res) => {
  const { data, error } = await supabase
    .from('students')
    .select('*')
    .order('name', { ascending: true });

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

app.listen(3000, () => {
  console.log('🚀 서버가 3000번 포트에서 실행 중입니다!');
});