/**
 * posts 테이블 전건 임베딩 스크립트
 * - title + content를 결합하여 OpenAI text-embedding-3-small로 임베딩
 * - 배치 처리 (20건씩) + rate limit 대응
 * - 이미 임베딩된 건은 건너뜀
 */
import pg from 'pg';
import OpenAI from 'openai';

const pool = new pg.Pool({
  host: '127.0.0.1', port: 5432,
  database: 'hanul_thought', user: 'postgres', password: 'postgres',
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'REMOVED',
});

const BATCH = 20;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  // 임베딩 안 된 것 중 content가 있는 건만
  const { rows: pending } = await pool.query(`
    SELECT id, post_id, title, LEFT(content, 6000) AS content
    FROM yeouiseonwon.posts
    WHERE embedding IS NULL
      AND content IS NOT NULL AND length(content) > 30
    ORDER BY id
  `);

  console.log(`[시작] 임베딩 대상: ${pending.length}건`);

  let done = 0, errors = 0;

  for (let i = 0; i < pending.length; i += BATCH) {
    const batch = pending.slice(i, i + BATCH);
    const texts = batch.map(r => {
      const t = (r.title || '') + '\n' + (r.content || '');
      return t.substring(0, 8000);
    });

    try {
      const embRes = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: texts,
      });

      // 배치 업데이트
      for (let j = 0; j < batch.length; j++) {
        const vec = '[' + embRes.data[j].embedding.join(',') + ']';
        await pool.query(
          'UPDATE yeouiseonwon.posts SET embedding = $1::vector WHERE id = $2',
          [vec, batch[j].id]
        );
      }

      done += batch.length;
      if (done % 200 === 0 || done === pending.length) {
        console.log(`[진행] ${done}/${pending.length} (${((done/pending.length)*100).toFixed(1)}%) errors:${errors}`);
      }

      await sleep(50); // rate limit
    } catch (e) {
      if (e.status === 429) {
        console.log(`[429 Rate Limit] 30초 대기...`);
        await sleep(30000);
        i -= BATCH; // retry
        continue;
      }
      console.error(`[ERROR] batch ${i}: ${e.message}`);
      errors++;
      // 개별 처리 fallback
      for (const row of batch) {
        try {
          const t = ((row.title || '') + '\n' + (row.content || '')).substring(0, 8000);
          const r = await openai.embeddings.create({ model: 'text-embedding-3-small', input: t });
          const vec = '[' + r.data[0].embedding.join(',') + ']';
          await pool.query('UPDATE yeouiseonwon.posts SET embedding = $1::vector WHERE id = $2', [vec, row.id]);
          done++;
          await sleep(50);
        } catch (e2) {
          console.error(`  [SKIP] id=${row.id}: ${e2.message}`);
          errors++;
        }
      }
    }
  }

  console.log(`[완료] ${done}건 임베딩, ${errors}건 에러`);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
