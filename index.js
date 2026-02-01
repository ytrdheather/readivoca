// 1. 필요한 도구들 가져오기
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// ==========================================
// ▼ 여기에 아까 복사한 Supabase 정보를 넣으세요!
// ==========================================
const supabaseUrl = 'https://cbnldlmwsdzptniumokd.supabase.co';
const supabaseKey = 'sb_publishable_-qAdnli9EsT1-iKCOEKyMw_f50-rp8i';
const supabase = createClient(supabaseUrl, supabaseKey);

// ==========================================
// 1. 로그인 기능 (아이디/비번 확인)
// ==========================================
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  // DB에서 아이디와 비번이 일치하는 학생 찾기
  const { data, error } = await supabase
    .from('students')
    .select('*')
    .eq('username', username)
    .eq('password', password)
    .single();

  if (error || !data) {
    return res.status(401).json({ message: '아이디 또는 비밀번호가 틀렸어요!' });
  }

  // 성공하면 학생 정보와 지정된 책 이름 보내주기
  res.json({ 
    message: '로그인 성공!', 
    student_name: data.name,
    book_name: data.assigned_book 
  });
});

// ==========================================
// 2. 책 목록 가져오기 (학생이 고를 수 있게)
// ==========================================
app.get('/books', async (req, res) => {
  // words_original 테이블에서 책 이름만 중복 없이 가져오기
  // (참고: Supabase는 distinct 기능이 조금 까다로워서 일단 다 가져와서 거릅니다)
  const { data, error } = await supabase
    .from('words_original')
    .select('book_name');

  if (error) return res.status(400).json({ error: error.message });

  // 중복 제거 (Set 이용)
  const uniqueBooks = [...new Set(data.map(item => item.book_name))];
  res.json(uniqueBooks);
});
// ==========================================
// [추가] 선택한 책의 유닛 목록 가져오기
// ==========================================
app.get('/units', async (req, res) => {
  const { book_name } = req.query; // 요청에서 책 이름 꺼내기

  if (!book_name) {
    return res.status(400).json({ error: '책 이름을 알려주세요!' });
  }

  // DB에서 해당 책의 유닛 이름들만 가져오기
  const { data, error } = await supabase
    .from('words_original')
    .select('unit_name')
    .eq('book_name', book_name);

  if (error) return res.status(400).json({ error: error.message });

  // 중복 제거하고 정렬해서 보내주기
  const uniqueUnits = [...new Set(data.map(item => item.unit_name))].sort();
  res.json(uniqueUnits);
});
// ==========================================
// 3. 학습 시작 (선택한 책과 유닛의 단어 가져오기)
// ==========================================
app.post('/start-learning', async (req, res) => {
  const { book_name, unit_name } = req.body;

  // 해당 책, 해당 유닛의 단어들을 번호 순서대로 가져오기
  const { data, error } = await supabase
    .from('words_original')
    .select('*')
    .eq('book_name', book_name)
    .eq('unit_name', unit_name)
    .order('word_no', { ascending: true });

  if (error) return res.status(400).json({ error: error.message });

  res.json(data);
});

// 서버 켜기 (포트 3000번)
app.listen(3000, () => {
  console.log('🚀 리디튜드 단어장 서버가 켜졌습니다! (http://localhost:3000)');
});