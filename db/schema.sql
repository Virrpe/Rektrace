-- RekTrace Timescale-ready schema (idempotent)
-- Extensions (optional if permissions allow)
DO $$
BEGIN
  EXECUTE 'CREATE EXTENSION IF NOT EXISTS timescaledb';
EXCEPTION WHEN OTHERS THEN
  -- ignore if not permitted
  NULL;
END$$;

DO $$
BEGIN
  EXECUTE 'CREATE EXTENSION IF NOT EXISTS pgcrypto';
EXCEPTION WHEN OTHERS THEN
  NULL;
END$$;

-- scan_events: time-series of discovery / enrichment events
CREATE TABLE IF NOT EXISTS scan_events (
  time        TIMESTAMPTZ NOT NULL DEFAULT now(),
  id          BIGSERIAL,
  token       TEXT,
  chain       TEXT,
  event       JSONB,
  status      TEXT,
  PRIMARY KEY (id, time)
);

-- Convert to hypertable if available
SELECT
  CASE
    WHEN to_regclass('public.scan_events') IS NOT NULL AND
         EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'create_hypertable')
    THEN (SELECT create_hypertable('scan_events', 'time', if_not_exists => TRUE))
    ELSE NULL
  END;

CREATE INDEX IF NOT EXISTS scan_events_time_idx ON scan_events (time DESC);

-- alert_messages: Telegram alert audit
CREATE TABLE IF NOT EXISTS alert_messages (
  id          BIGSERIAL PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  chat_id     TEXT NOT NULL,
  text        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'queued'
);


