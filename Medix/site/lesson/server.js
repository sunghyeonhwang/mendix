// ============================================================
// JB Lessons - server.js
// 학습 진도 데이터 저장을 위한 PostgreSQL 백엔드 서버
// 단일 파일 구성: DB 연결 + 스키마 초기화 + REST API
// ============================================================

const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

// ----------------------------------------------------------
// 환경 변수 로드 (.env 파일이 있으면 사용)
// ----------------------------------------------------------
try {
  require('dotenv').config();
} catch (_) {
  // dotenv가 없어도 동작 (환경변수 직접 설정 가능)
}

const DATABASE_URL = process.env.DATABASE_URL || '';
const PORT = process.env.PORT || 3000;

// ----------------------------------------------------------
// PostgreSQL 연결 풀
// ----------------------------------------------------------
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes('localhost') || DATABASE_URL.includes('127.0.0.1')
    ? false
    : { rejectUnauthorized: false },
});

// ----------------------------------------------------------
// DB 스키마 초기화 (init.sql 실행)
// ----------------------------------------------------------
async function initDatabase() {
  const sqlPath = path.join(__dirname, 'init.sql');
  if (!fs.existsSync(sqlPath)) {
    console.warn('[DB] init.sql 파일을 찾을 수 없습니다. 스키마 초기화를 건너뜁니다.');
    return;
  }

  const sql = fs.readFileSync(sqlPath, 'utf-8');
  try {
    await pool.query(sql);
    console.log('[DB] 스키마 초기화 완료');
  } catch (err) {
    // 이미 존재하는 테이블/데이터는 무시 (IF NOT EXISTS, ON CONFLICT)
    if (err.code === '42P07' || err.code === '23505') {
      console.log('[DB] 스키마가 이미 존재합니다. 초기화를 건너뜁니다.');
    } else {
      console.error('[DB] 스키마 초기화 실패:', err.message);
    }
  }
}

// ----------------------------------------------------------
// Express 앱 설정
// ----------------------------------------------------------
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ----------------------------------------------------------
// 헬스 체크
// ----------------------------------------------------------
app.get('/api/health', async (_req, res) => {
  try {
    const result = await pool.query('SELECT NOW() AS server_time');
    res.json({ status: 'ok', db_time: result.rows[0].server_time });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ===========================================================
// 코스 API
// ===========================================================

// 전체 코스 목록
app.get('/api/courses', async (_req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM courses ORDER BY sort_order ASC'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 단일 코스 상세 (레슨 + 강의 목록 포함)
app.get('/api/courses/:courseId', async (req, res) => {
  const { courseId } = req.params;
  try {
    const courseResult = await pool.query(
      'SELECT * FROM courses WHERE id = $1',
      [courseId]
    );
    if (courseResult.rows.length === 0) {
      return res.status(404).json({ error: '코스를 찾을 수 없습니다.' });
    }

    const lessonsResult = await pool.query(
      `SELECT l.*,
              json_agg(
                json_build_object(
                  'id', lec.id,
                  'title', lec.title,
                  'description', lec.description,
                  'video_url', lec.video_url,
                  'duration', lec.duration,
                  'sort_order', lec.sort_order
                ) ORDER BY lec.sort_order
              ) AS lectures
       FROM   lessons l
       LEFT JOIN lectures lec ON lec.lesson_id = l.id
       WHERE  l.course_id = $1
       GROUP BY l.id
       ORDER BY l.sort_order ASC`,
      [courseId]
    );

    res.json({
      ...courseResult.rows[0],
      lessons: lessonsResult.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===========================================================
// 학습 진도 API
// ===========================================================

// 사용자별 특정 코스 진도 조회
app.get('/api/progress/:userId/courses/:courseId', async (req, res) => {
  const { userId, courseId } = req.params;
  try {
    // 코스 전체 진행률
    const courseProgress = await pool.query(
      'SELECT * FROM user_course_progress WHERE user_id = $1 AND course_id = $2',
      [userId, courseId]
    );

    // 강의별 상세 진도
    const lectureProgress = await pool.query(
      `SELECT ulp.*, lec.title AS lecture_title, lec.duration AS lecture_duration,
              les.title AS lesson_title
       FROM   user_lecture_progress ulp
       JOIN   lectures lec ON ulp.lecture_id = lec.id
       JOIN   lessons les  ON lec.lesson_id = les.id
       WHERE  ulp.user_id = $1
         AND  les.course_id = $2
       ORDER BY les.sort_order, lec.sort_order`,
      [userId, courseId]
    );

    res.json({
      course_progress: courseProgress.rows[0] || null,
      lecture_progress: lectureProgress.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 강의 시청 진도 업데이트 (UPSERT)
app.put('/api/progress/:userId/lectures/:lectureId', async (req, res) => {
  const { userId, lectureId } = req.params;
  const { last_position, completed } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO user_lecture_progress (user_id, lecture_id, last_position, completed, completed_at, updated_at)
       VALUES ($1, $2, $3, $4, CASE WHEN $4 THEN NOW() ELSE NULL END, NOW())
       ON CONFLICT (user_id, lecture_id)
       DO UPDATE SET
         last_position = EXCLUDED.last_position,
         completed     = EXCLUDED.completed,
         completed_at  = CASE WHEN EXCLUDED.completed AND NOT user_lecture_progress.completed
                              THEN NOW()
                              ELSE user_lecture_progress.completed_at END,
         updated_at    = NOW()
       RETURNING *`,
      [userId, lectureId, last_position || 0, completed || false]
    );

    // 코스 전체 진행률 재계산
    const courseRow = await pool.query(
      `SELECT les.course_id
       FROM   lectures lec
       JOIN   lessons les ON lec.lesson_id = les.id
       WHERE  lec.id = $1`,
      [lectureId]
    );

    if (courseRow.rows.length > 0) {
      const courseId = courseRow.rows[0].course_id;
      await pool.query(
        `INSERT INTO user_course_progress (user_id, course_id, completed_lectures, total_lectures, progress_pct, last_accessed_at, updated_at)
         SELECT
           $1,
           $2,
           COUNT(*) FILTER (WHERE ulp.completed),
           (SELECT COUNT(*) FROM lectures lec2 JOIN lessons les2 ON lec2.lesson_id = les2.id WHERE les2.course_id = $2),
           CASE
             WHEN (SELECT COUNT(*) FROM lectures lec2 JOIN lessons les2 ON lec2.lesson_id = les2.id WHERE les2.course_id = $2) = 0 THEN 0
             ELSE ROUND(
               COUNT(*) FILTER (WHERE ulp.completed) * 100.0 /
               (SELECT COUNT(*) FROM lectures lec2 JOIN lessons les2 ON lec2.lesson_id = les2.id WHERE les2.course_id = $2),
               2
             )
           END,
           NOW(),
           NOW()
         FROM   user_lecture_progress ulp
         JOIN   lectures lec ON ulp.lecture_id = lec.id
         JOIN   lessons les  ON lec.lesson_id = les.id
         WHERE  ulp.user_id = $1 AND les.course_id = $2
         ON CONFLICT (user_id, course_id)
         DO UPDATE SET
           completed_lectures = EXCLUDED.completed_lectures,
           total_lectures     = EXCLUDED.total_lectures,
           progress_pct       = EXCLUDED.progress_pct,
           last_accessed_at   = NOW(),
           updated_at         = NOW()`,
        [userId, courseId]
      );
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 사용자의 전체 코스 진행률 목록
app.get('/api/progress/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const result = await pool.query(
      `SELECT ucp.*, c.title AS course_title, c.status AS course_status
       FROM   user_course_progress ucp
       JOIN   courses c ON ucp.course_id = c.id
       WHERE  ucp.user_id = $1
       ORDER BY ucp.last_accessed_at DESC NULLS LAST`,
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===========================================================
// 서버 시작
// ===========================================================
async function start() {
  let dbConnected = false;

  if (!DATABASE_URL) {
    console.warn('[WARN] DATABASE_URL 환경변수가 설정되지 않았습니다.');
    console.warn('  예: DATABASE_URL=postgres://user:pass@localhost:5432/jb_lessons');
    console.warn('  DB 없이 정적 파일 서빙 모드로 실행합니다. API 엔드포인트는 사용할 수 없습니다.');
  } else {
    // DB 연결 테스트
    try {
      const client = await pool.connect();
      console.log('[DB] PostgreSQL 연결 성공');
      client.release();
      dbConnected = true;
    } catch (err) {
      console.warn('[DB] PostgreSQL 연결 실패:', err.message);
      console.warn('  DB 없이 정적 파일 서빙 모드로 실행합니다. API 엔드포인트는 사용할 수 없습니다.');
    }
  }

  // 스키마 초기화 (DB 연결 성공 시에만)
  if (dbConnected) {
    await initDatabase();
  }

  // 서버 시작
  app.listen(PORT, () => {
    console.log(`[Server] JB Lessons 서버가 포트 ${PORT}에서 실행 중입니다.`);
    console.log(`  - 홈페이지: http://localhost:${PORT}`);
    if (dbConnected) {
      console.log(`  - 헬스 체크: http://localhost:${PORT}/api/health`);
      console.log(`  - 코스 목록: http://localhost:${PORT}/api/courses`);
    } else {
      console.log('  - DB 미연결: API 엔드포인트 비활성 상태');
    }
  });
}

start();
