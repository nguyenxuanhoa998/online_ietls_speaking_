
create database ieltsSpeaking;
use ieltsSpeaking;
CREATE TABLE users (
  id            INT           NOT NULL AUTO_INCREMENT,
  full_name     VARCHAR(100)  NOT NULL,
  email         VARCHAR(150)  NOT NULL,
  password_hash VARCHAR(255)  NOT NULL,
  role          ENUM('student','teacher','admin') NOT NULL,
  is_approved   BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at    DATETIME      NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id),
  UNIQUE KEY uq_email (email)
);
CREATE TABLE questions (
  id            INT           NOT NULL AUTO_INCREMENT,
  part          ENUM('part1','part2','part3') NOT NULL,
  topic         VARCHAR(200),
  question_text TEXT          NOT NULL,
  created_at    DATETIME      NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id)
);
CREATE TABLE submissions (
  id              INT           NOT NULL AUTO_INCREMENT,
  user_id         INT           NOT NULL,
  question_id     INT           NOT NULL,
  audio_file_path VARCHAR(500)  NOT NULL,
  transcript      TEXT,
  status          ENUM('pending','transcribed',
                       'ai_evaluated','completed')
                  NOT NULL DEFAULT 'pending',
  submitted_at    DATETIME      NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id),
  FOREIGN KEY (user_id)     REFERENCES users(id),
  FOREIGN KEY (question_id) REFERENCES questions(id)
);
CREATE TABLE ai_evaluations (
  id                    INT           NOT NULL AUTO_INCREMENT,
  submission_id         INT           NOT NULL,
  fluency_score         DECIMAL(3,1),
  lexical_score         DECIMAL(3,1),
  grammar_score         DECIMAL(3,1),
  overall_score         DECIMAL(3,1),
  strengths             TEXT,
  areas_for_improvement TEXT,
  raw_llm_response      JSON,
  evaluated_at          DATETIME      NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id),
  UNIQUE KEY uq_submission (submission_id),
  FOREIGN KEY (submission_id) REFERENCES submissions(id)
);
CREATE TABLE teacher_reviews (
  id                  INT           NOT NULL AUTO_INCREMENT,
  submission_id       INT           NOT NULL,
  teacher_id          INT           NOT NULL,
  pronunciation_score DECIMAL(3,1),
  adjusted_fluency    DECIMAL(3,1),
  adjusted_lexical    DECIMAL(3,1),
  adjusted_grammar    DECIMAL(3,1),
  final_overall_score DECIMAL(3,1),
  teacher_feedback    TEXT,
  reviewed_at         DATETIME      NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id),
  UNIQUE KEY uq_review (submission_id, teacher_id),
  FOREIGN KEY (submission_id) REFERENCES submissions(id),
  FOREIGN KEY (teacher_id)   REFERENCES users(id)
);
