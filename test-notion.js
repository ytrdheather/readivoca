const { Client } = require('@notionhq/client');

console.log("🔍 노션 도구 진단 시작...");

try {
    const notion = new Client({ auth: 'test_key' });
    
    console.log("1. 클라이언트 생성: 성공 ✅");
    
    if (notion.databases) {
        console.log("2. databases 기능: 있음 ✅");
        if (typeof notion.databases.query === 'function') {
            console.log("3. query 기능: 정상 (함수임) ✅");
            console.log("🎉 결론: 도구는 정상입니다! 코드 오타를 확인하세요.");
        } else {
            console.log("❌ 3. query 기능: 비정상 (함수가 아님)");
        }
    } else {
        console.log("❌ 2. databases 기능: 없음 (구버전일 가능성 높음)");
    }
} catch (e) {
    console.log("💥 치명적 에러:", e.message);
}