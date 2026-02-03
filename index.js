const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const { Client } = require('@notionhq/client');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// ★ [NEW] 'public' 폴더 안에 있는 파일들을 화면에 보여줘라!
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
const notion = new Client({ auth: NOTION_KEY });

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
  
  // 테스트용 강제 이름 (나중에 data.name으로 복구하세요)
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

  // [테스트용] Day 01이면 5개만 가져오기
  if (unit_name && unit_name.toUpperCase().includes('DAY 01')) {
    console.log("⚡ [테스트 모드] Day 01이라서 단어 5개만 가져옵니다.");
    query = query.limit(5);
  }

  const { data, error } = await query;
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// 5. 점수 저장 및 노션 전송
app.post('/save-score', async (req, res) => {
  const { student_name, book_name, unit_name, study_type, score, wrong_count, wrong_words } = req.body;
  const today = new Date().toISOString().split('T')[0];

  console.log(`📝 [기록 요청] ${student_name} / ${study_type} / ${score}점`);

  try {
    // 1. Supabase 저장
    await supabase.from('study_records').insert({
      who: student_name,
      what: `${book_name} - ${unit_name}`,
      which: study_type,
      score: score,
      wrong_count: wrong_count,
      wrong_words: wrong_words,
      when: new Date()
    });

    // 2. Notion 페이지 찾기 & 업데이트
    // (게임 점수는 노션에 필수 전송 항목이 아니라면 에러가 나도 무시하도록 처리 가능)
    if (study_type.includes('game')) {
        // 게임 점수는 노션에 칸이 없으면 패스 (혹은 노션에 '게임점수' 속성 추가 필요)
        return res.json({ message: "게임 점수 저장 완료 (Supabase Only)" });
    }

    const response = await notion.databases.query({
      database_id: NOTION_DB_ID,
      filter: {
        and: [
          { property: '학생 이름', title: { equals: student_name } }, 
          { property: '날짜', date: { equals: today } }             
        ]
      }
    });

    if (response.results.length > 0) {
      const page = response.results[0];
      const pageId = page.id;
      
      const currentBook1 = page.properties['단어교재1']?.rich_text?.[0]?.plain_text || "";
      const currentBook2 = page.properties['단어교재2']?.rich_text?.[0]?.plain_text || "";
      let slotSuffix = "";

      if (currentBook1 === "" || currentBook1 === book_name) slotSuffix = "1"; 
      else if (currentBook2 === "" || currentBook2 === book_name) slotSuffix = "2"; 
      else return res.json({ message: "Notion 슬롯 초과" });

      const updateData = {};
      updateData[`단어교재${slotSuffix}`] = { rich_text: [{ text: { content: book_name } }] };
      updateData[`단어유닛${slotSuffix}`] = { rich_text: [{ text: { content: unit_name } }] };

      const formattedWrongWords = wrong_words || "-";
      if (study_type === 'spelling') {
        updateData[`스펠링점수${slotSuffix}`] = { number: score };
        updateData[`스펠링오답${slotSuffix}`] = { rich_text: [{ text: { content: formattedWrongWords } }] };
      } else if (study_type === 'quiz') { 
        updateData[`반복점수${slotSuffix}`] = { number: score };
        updateData[`반복오답${slotSuffix}`] = { rich_text: [{ text: { content: formattedWrongWords } }] };
      } else if (study_type === 'test') { 
        updateData[`테스트점수${slotSuffix}`] = { number: score };
        updateData[`테스트오답${slotSuffix}`] = { rich_text: [{ text: { content: formattedWrongWords } }] };
      }

      await notion.pages.update({ page_id: pageId, properties: updateData });
      console.log(`✅ Notion 업데이트 완료`);
    }

    res.json({ message: "저장 완료" });

  } catch (error) {
    console.error("서버 에러:", error);
    res.status(500).json({ error: "저장 중 오류 발생" });
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