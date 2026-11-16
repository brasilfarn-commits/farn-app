CREATE TABLE IF NOT EXISTS docs (
  col TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (col, id)
);
CREATE INDEX IF NOT EXISTS idx_docs_col ON docs(col);
CREATE INDEX IF NOT EXISTS idx_docs_updated ON docs(updated_at);
