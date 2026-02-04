const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
// const { Client } = require('@notionhq/client'); // 이 도구는 이제 버립니다!
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// ★ 'public' 폴더 안에 있는 파일들을 화면에 보여줘라!
app.use(express.static('public'));

// =======================================================
// ▼▼▼ 키 설정 ▼▼▼
// =======================================================
const supabaseUrl = 'https://cbnldlmwsdzptniumokd.supabase.co';
const supabaseKey = 'sb_publishable_-qAdnli9EsT1-iKCOEKyMw_f50-rp8i';

// ★ Notion 키 (직접 연결용)
const NOTION_KEY = 'ntn_O24683962583p89EYlVuyYlC4cHGMUbYhF7zF2SizDqb0C'; 
const NOTION_DB_ID = '25409320bce2807697ede3f1c1b62ada';      
// =======================================================

const supabase = createClient(supabaseUrl, supabaseKey);

// ★ [NEW] 노션 직통 전화 함수 (도구 없이 직접 통신)
async function callNotion(endpoint, method, body) {
  const response = await fetch(`https://api.notion.com/v1${endpoint}`, {
    method: method,
    headers: {
      'Authorization': `Bearer ${NOTION_KEY}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28' // 가장 안정적인 버전
    },
    body: JSON.stringify(body)
  });
  return await response.json();
}

// 1. 로그인
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const { data, error } = await supabase
    .from('students')
    .select('*')
    .eq('username', username)
    .eq('password', password)
    .single();

  if (error || !data) return res.status(401).json({ message: '로그인 실패' });
  
  res.json({ 
    message: '성공', 
    student_name: 'Test 원장', 
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
    console.log("⚡ [테스트 모드] Day 01이라서 단어 5개만 가져옵니다.");
    query = query.limit(5);
  }

  const { data, error } = await query;
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// 5. 점수 저장 및 노션 전송 (직통 전화 사용)
app.post('/save-score', async (req, res) => {
  const { student_name, book_name, unit_name, study_type, score, wrong_count, wrong_words } = req.body;
  const today = new Date().toISOString().split('T')[0];

  console.log(`📝 [기록 요청] ${student_name} / ${study_type} / ${score}점`);

  try {
    // 1. Supabase 저장
    await supabase.from('study_records').insert({
      who: student_name, what: `${book_name} - ${unit_name}`, which: study_type,
      score: score, wrong_count: wrong_count, wrong_words: wrong_words, when: new Date()
    });

    if (study_type.includes('game')) return res.json({ message: "게임 점수 저장 완료" });

    // 2. Notion 페이지 찾기 (직접 요청)
    const queryBody = {
      filter: {
        and: [
          { property: '이름', title: { equals: student_name } }, 
          { property: '🕐 날짜', date: { equals: today } } // ★ [수정됨] 이모지 포함한 정확한 속성명!
        ]
      }
    };

    // Notion API 호출
    const response = await callNotion(`/databases/${NOTION_DB_ID}/query`, 'POST', queryBody);

    if (response.results && response.results.length > 0) {
      const page = response.results[0];
      const pageId = page.id;
      
      const currentBook1 = page.properties['단어교재1']?.rich_text?.[0]?.plain_text || "";
      const currentBook2 = page.properties['단어교재2']?.rich_text?.[0]?.plain_text || "";
      let slotSuffix = (currentBook1 === "" || currentBook1 === book_name) ? "1" : (currentBook2 === "" || currentBook2 === book_name) ? "2" : null;

      if (!slotSuffix) {
        console.log("⚠️ Notion 슬롯 초과");
        return res.json({ message: "Notion 슬롯 초과" });
      }

      console.log(`📌 Notion 슬롯 당첨: ${slotSuffix}번`);

      const updateData = {};
      updateData[`단어교재${slotSuffix}`] = { rich_text: [{ text: { content: book_name } }] };
      updateData[`단어유닛${slotSuffix}`] = { rich_text: [{ text: { content: unit_name } }] };
      const wText = wrong_words || "-";

      if (study_type === 'spelling') { 
        updateData[`스펠링점수${slotSuffix}`] = { number: score }; 
        updateData[`스펠링오답${slotSuffix}`] = { rich_text: [{ text: { content: wText } }] }; 
      }
      else if (study_type === 'quiz') { 
        updateData[`반복점수${slotSuffix}`] = { number: score }; 
        updateData[`반복오답${slotSuffix}`] = { rich_text: [{ text: { content: wText } }] }; 
      }
      else if (study_type === 'test') { 
        updateData[`테스트점수${slotSuffix}`] = { number: score }; 
        updateData[`테스트오답${slotSuffix}`] = { rich_text: [{ text: { content: wText } }] }; 
      }

      // 3. Notion 업데이트 (직접 요청)
      await callNotion(`/pages/${pageId}`, 'PATCH', { properties: updateData });
      console.log(`✅ Notion 업데이트 완료`);
    } else {
      console.log("⚠️ Notion에서 오늘자 학생 페이지를 못 찾았습니다.");
    }

    res.json({ message: "저장 완료" });

  } catch (error) { 
    console.error("서버 에러:", error);
    res.status(500).json({ error: "저장 오류" }); 
  }
});

// 6. 랭킹
app.get('/rankings', async (req, res) => {
  const { game_type } = req.query;
  try {
    const { data } = await supabase.from('study_records').select('who, score').eq('which', game_type).order('score', { ascending: false }).limit(10);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(3000, () => {
  console.log('🚀 서버가 3000번 포트에서 실행 중입니다!');
});