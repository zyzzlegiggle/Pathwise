
-- This is used to create the tables used in the app. use this in tidb cloud

-- USERS & PROFILE
CREATE TABLE IF NOT EXISTS users (
  user_id BIGINT PRIMARY KEY AUTO_RANDOM,
  email VARCHAR(255) UNIQUE,
  name VARCHAR(255),
  country VARCHAR(64),
  years_experience DECIMAL(4,1),
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_skills (
  user_id BIGINT NOT NULL,
  skill_name VARCHAR(128) NOT NULL,
  proficiency TINYINT,              -- 1-5
  years DECIMAL(4,1),
  last_used DATE,
  PRIMARY KEY (user_id, skill_name),
  INDEX idx_user_skills_skill (skill_name),
  CONSTRAINT fk_user_skills_user
    FOREIGN KEY (user_id) REFERENCES users(user_id)
    ON DELETE CASCADE
);

-- Resume text + embedding (VECTOR)
CREATE TABLE IF NOT EXISTS resumes (
  user_id BIGINT PRIMARY KEY,
  raw_text MEDIUMTEXT,
  embedding VECTOR(768) /* e.g., all-MiniLM-L6-v2 */,
  CONSTRAINT fk_resumes_user
    FOREIGN KEY (user_id) REFERENCES users(user_id)
    ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_resumes_embedding ON resumes (embedding) USING HNSW;

-- JOBS & REQUIREMENTS
CREATE TABLE IF NOT EXISTS jobs (
  job_id BIGINT PRIMARY KEY AUTO_RANDOM,
  source VARCHAR(64),               -- usajobs, adzuna, etc.
  external_id VARCHAR(128),
  title VARCHAR(255),
  company VARCHAR(255),
  location VARCHAR(255),
  min_salary INT NULL,
  max_salary INT NULL,
  currency VARCHAR(8) DEFAULT 'USD',
  post_date DATE,
  url TEXT,
  UNIQUE KEY uniq_jobs_source_extid (source, external_id),
  INDEX idx_jobs_postdate (post_date),
  INDEX idx_jobs_title (title)
);

CREATE TABLE IF NOT EXISTS job_texts (
  job_id BIGINT PRIMARY KEY,
  description MEDIUMTEXT,
  embedding VECTOR(768),
  CONSTRAINT fk_job_texts_job
    FOREIGN KEY (job_id) REFERENCES jobs(job_id)
    ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_job_texts_embedding ON job_texts (embedding) USING HNSW;

CREATE TABLE IF NOT EXISTS job_requirements (
  job_id BIGINT NOT NULL,
  skill_name VARCHAR(128) NOT NULL,
  importance TINYINT,               -- 1–5 weight
  PRIMARY KEY (job_id, skill_name),
  INDEX idx_jobreq_skill (skill_name),
  CONSTRAINT fk_jobreq_job
    FOREIGN KEY (job_id) REFERENCES jobs(job_id)
    ON DELETE CASCADE
);

-- SKILL ONTOLOGY
CREATE TABLE IF NOT EXISTS skills_catalog (
  skill_name VARCHAR(128) PRIMARY KEY,
  category VARCHAR(128),
  aliases JSON,                     -- ["golang","go"]
  embedding VECTOR(768)
);
CREATE INDEX IF NOT EXISTS idx_skills_embedding ON skills_catalog (embedding) USING HNSW;

-- LEARNING RESOURCES
CREATE TABLE IF NOT EXISTS resources (
  resource_id BIGINT PRIMARY KEY AUTO_RANDOM,
  title VARCHAR(255),
  provider VARCHAR(128),
  url TEXT,
  hours_estimate DECIMAL(5,1),
  cost DECIMAL(8,2) DEFAULT 0,
  skill_targets JSON,               -- ["rust", "tokio"]
  description MEDIUMTEXT,
  embedding VECTOR(768),
  INDEX idx_resources_provider (provider)
);
CREATE INDEX IF NOT EXISTS idx_resources_embedding ON resources (embedding) USING HNSW;

-- SIMULATIONS & RESULTS
CREATE TABLE IF NOT EXISTS simulations (
  sim_id BIGINT PRIMARY KEY AUTO_RANDOM,
  user_id BIGINT NOT NULL,
  path_name VARCHAR(255),
  duration_weeks INT,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sim_user (user_id),
  CONSTRAINT fk_sim_user
    FOREIGN KEY (user_id) REFERENCES users(user_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS simulation_steps (
  sim_id BIGINT NOT NULL,
  week INT NOT NULL,
  added_skills JSON,                         -- skills “gained” this week
  est_qualification_score DECIMAL(5,2),      -- 0-100
  PRIMARY KEY (sim_id, week),
  CONSTRAINT fk_simsteps_sim
    FOREIGN KEY (sim_id) REFERENCES simulations(sim_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sim_targets (
  sim_id BIGINT NOT NULL,
  job_id BIGINT NOT NULL,
  fit_score DECIMAL(5,2),           -- cosine(user+path vs job)
  gap_skills JSON,                  -- remaining gaps
  rationale MEDIUMTEXT,
  PRIMARY KEY (sim_id, job_id),
  INDEX idx_simtargets_fitscore (fit_score),
  CONSTRAINT fk_simtargets_sim
    FOREIGN KEY (sim_id) REFERENCES simulations(sim_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_simtargets_job
    FOREIGN KEY (job_id) REFERENCES jobs(job_id)
    ON DELETE CASCADE
);

-- Helpful functional indexes / lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_user_country ON users (country);

-- Optional: quick view to inspect most recent jobs
CREATE OR REPLACE VIEW v_recent_jobs AS
SELECT j.job_id, j.title, j.company, j.location, j.post_date, j.url
FROM jobs j
ORDER BY j.post_date DESC;
