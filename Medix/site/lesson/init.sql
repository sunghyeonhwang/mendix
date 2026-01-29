-- ============================================================
-- JB Lessons - 학습 진도 데이터 저장을 위한 DB 스키마
-- PostgreSQL v15+
-- ============================================================

BEGIN;

-- ============================================================
-- 1. users: 사용자 정보
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,
    email           VARCHAR(255) NOT NULL UNIQUE,
    display_name    VARCHAR(100) NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users (email);

-- ============================================================
-- 2. courses: 코스(레슨) 목록
--    예: 레슨 1 - 바이브 코딩 (6개 강의), 레슨 2 - Maia (준비중)
-- ============================================================
CREATE TABLE IF NOT EXISTS courses (
    id              SERIAL PRIMARY KEY,
    title           VARCHAR(255) NOT NULL,
    description     TEXT,
    instructor_name VARCHAR(100),
    thumbnail_url   VARCHAR(512),
    total_duration  INTEGER       NOT NULL DEFAULT 0,  -- 총 강의 시간 (초 단위)
    status          VARCHAR(20)   NOT NULL DEFAULT 'published'
                        CHECK (status IN ('draft', 'published', 'archived')),
    sort_order      INTEGER       NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 3. lessons: 코스 내 섹션(레슨/섹션) 목록
--    예: 섹션 1 - React 기초, 섹션 2 - 심화 개념 등
-- ============================================================
CREATE TABLE IF NOT EXISTS lessons (
    id              SERIAL PRIMARY KEY,
    course_id       INTEGER       NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title           VARCHAR(255)  NOT NULL,
    description     TEXT,
    sort_order      INTEGER       NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_lessons_course_id ON lessons (course_id);

-- ============================================================
-- 4. lectures: 개별 강의(영상) 목록
--    예: React란 무엇인가? (15:20), 개발 환경 설정 (22:45) 등
-- ============================================================
CREATE TABLE IF NOT EXISTS lectures (
    id              SERIAL PRIMARY KEY,
    lesson_id       INTEGER       NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    title           VARCHAR(255)  NOT NULL,
    description     TEXT,
    video_url       VARCHAR(512),
    duration        INTEGER       NOT NULL DEFAULT 0,  -- 영상 길이 (초 단위)
    sort_order      INTEGER       NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_lectures_lesson_id ON lectures (lesson_id);

-- ============================================================
-- 5. user_lecture_progress: 사용자별 강의 시청 진도
--    - last_position: 마지막 시청 위치 (초 단위 타임스탬프)
--    - completed: 시청 완료 여부
-- ============================================================
CREATE TABLE IF NOT EXISTS user_lecture_progress (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lecture_id      INTEGER       NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,
    last_position   INTEGER       NOT NULL DEFAULT 0,   -- 마지막 시청 위치 (초)
    completed       BOOLEAN       NOT NULL DEFAULT FALSE,
    completed_at    TIMESTAMPTZ,                         -- 완료 시각
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_user_lecture UNIQUE (user_id, lecture_id)
);

CREATE INDEX idx_ulp_user_id    ON user_lecture_progress (user_id);
CREATE INDEX idx_ulp_lecture_id ON user_lecture_progress (lecture_id);

-- ============================================================
-- 6. user_course_progress: 사용자별 코스 전체 진행률
--    - 코스별 전체 진행률을 캐싱하여 빠른 조회 지원
-- ============================================================
CREATE TABLE IF NOT EXISTS user_course_progress (
    id                  SERIAL PRIMARY KEY,
    user_id             INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id           INTEGER     NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    completed_lectures  INTEGER     NOT NULL DEFAULT 0,  -- 완료한 강의 수
    total_lectures      INTEGER     NOT NULL DEFAULT 0,  -- 코스 내 전체 강의 수
    progress_pct        NUMERIC(5,2) NOT NULL DEFAULT 0, -- 진행률 (0.00 ~ 100.00)
    last_accessed_at    TIMESTAMPTZ,                      -- 마지막 학습 시각
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_user_course UNIQUE (user_id, course_id)
);

CREATE INDEX idx_ucp_user_id   ON user_course_progress (user_id);
CREATE INDEX idx_ucp_course_id ON user_course_progress (course_id);

-- ============================================================
-- 7. 초기 시드 데이터: 레슨 1(바이브 코딩), 레슨 2(Maia)
-- ============================================================

-- 코스 등록
INSERT INTO courses (id, title, description, instructor_name, status, sort_order)
VALUES
    (1, '바이브 코딩', '바이브 코딩으로 배우는 실전 개발 가이드', '김재범', 'published', 1),
    (2, 'Maia', 'Maia 프레임워크 학습 코스 (준비중)', '김재범', 'draft', 2)
ON CONFLICT DO NOTHING;

-- 레슨 1: 바이브 코딩 - 섹션(레슨) 등록
INSERT INTO lessons (id, course_id, title, sort_order)
VALUES
    (1, 1, '바이브 코딩 기초', 1)
ON CONFLICT DO NOTHING;

-- 레슨 1: 바이브 코딩 - 6개 강의 등록
INSERT INTO lectures (id, lesson_id, title, duration, sort_order)
VALUES
    (1, 1, '바이브 코딩이란?',       920,  1),  -- 15:20
    (2, 1, '개발 환경 설정',         1365, 2),  -- 22:45
    (3, 1, '첫 번째 프로젝트 만들기', 1690, 3),  -- 28:10
    (4, 1, '컴포넌트 구조 이해',     2732, 4),  -- 45:32
    (5, 1, '상태 관리 기초',         2295, 5),  -- 38:15
    (6, 1, '이벤트와 인터랙션',      1540, 6)   -- 25:40
ON CONFLICT DO NOTHING;

-- 코스 total_duration 업데이트
UPDATE courses
SET    total_duration = (
           SELECT COALESCE(SUM(lec.duration), 0)
           FROM   lectures lec
           JOIN   lessons les ON lec.lesson_id = les.id
           WHERE  les.course_id = 1
       ),
       updated_at = NOW()
WHERE  id = 1;

-- 시퀀스 값 조정 (시드 데이터 이후 충돌 방지)
SELECT setval('courses_id_seq',  (SELECT MAX(id) FROM courses));
SELECT setval('lessons_id_seq',  (SELECT MAX(id) FROM lessons));
SELECT setval('lectures_id_seq', (SELECT MAX(id) FROM lectures));

COMMIT;
