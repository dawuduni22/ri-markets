-- ─────────────────────────────────────────────────────────────────────────────
-- RI Markets — Supabase Schema
-- ─────────────────────────────────────────────────────────────────────────────
-- Run each CREATE TABLE block separately in Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE closes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset        text NOT NULL,
  timeframe    text NOT NULL,
  candle_time  timestamptz NOT NULL,
  close_price  numeric NOT NULL,
  UNIQUE (asset, timeframe, candle_time)
);

CREATE TABLE markets (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset                   text NOT NULL,
  indicator               text NOT NULL,
  period                  integer NOT NULL,
  timeframe               text NOT NULL,
  threshold_high          numeric NOT NULL,
  threshold_low           numeric NOT NULL,
  pool_high               numeric DEFAULT 0,
  pool_low                numeric DEFAULT 0,
  status                  text DEFAULT 'open',
  outcome                 text,
  resolved_at             timestamptz,
  resolution_value        numeric,
  resolution_candle_time  timestamptz,
  created_at              timestamptz DEFAULT now()
);

CREATE TABLE bets (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id  uuid REFERENCES markets(id),
  side       text NOT NULL,
  amount     numeric NOT NULL,
  created_at timestamptz DEFAULT now()
);
