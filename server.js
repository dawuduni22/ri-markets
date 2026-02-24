// ─────────────────────────────────────────────────────────────────────────────
// server.js — RI Markets WebSocket Proxy + Supabase Candle Persistence
// ─────────────────────────────────────────────────────────────────────────────
// This is the SINGLE source of truth for writing candles to Supabase.
// The browser NEVER writes to the closes table — only this server does.
// It runs 24/7, saving confirmed 5m candles for ALL assets regardless of
// whether any browser clients are connected.
// ─────────────────────────────────────────────────────────────────────────────

import express from 'express'
import cors from 'cors'
import { WebSocketServer, WebSocket } from 'ws'
import { createServer } from 'http'
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config()

// ── Validate environment ────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error(
    '\n✖  Missing Supabase credentials.\n' +
    '   Create a .env file in the project root with:\n\n' +
    '   SUPABASE_URL=https://your-project-id.supabase.co\n' +
    '   SUPABASE_ANON_KEY=eyJhbGciOi...\n'
  )
  process.exit(1)
}

// ── Express + WS server ─────────────────────────────────────────────────────

const app = express()
const server = createServer(app)
const wss = new WebSocketServer({ server, path: '/ws' })
app.use(cors())

// ── Supabase client (server-side only) ──────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ── Constants ───────────────────────────────────────────────────────────────

const TIMEFRAME = '5'
const INTERVAL_S = 5 * 60

const BYBIT_WS = 'wss://stream.bybit.com/v5/public/linear'
const DEFAULT_TOPICS = [
  'kline.5.BTCUSDT',
  'kline.5.XAUTUSDT',
  'tickers.BTCUSDT',
  'tickers.XAUTUSDT',
]

// ── Time alignment helpers ──────────────────────────────────────────────────

function isAligned(t) {
  return Number.isInteger(t) && t > 0 && (t % INTERVAL_S === 0)
}

function alignFloor(t) {
  return Math.floor(t / INTERVAL_S) * INTERVAL_S
}

// ── Deduplication cache ─────────────────────────────────────────────────────

const savedCandles = new Set()
const MAX_SAVED_CACHE = 2000

function markSaved(key) {
  savedCandles.add(key)
  if (savedCandles.size > MAX_SAVED_CACHE) {
    const first = savedCandles.values().next().value
    savedCandles.delete(first)
  }
}

// ── Save a confirmed closed candle to Supabase ─────────────────────────────

async function saveCandle(asset, rawTime, close) {
  const t = isAligned(rawTime) ? rawTime : alignFloor(rawTime)
  if (!t || !isFinite(close) || close <= 0) return

  const key = `${asset}|${TIMEFRAME}|${t}`
  if (savedCandles.has(key)) return

  markSaved(key)

  const candle_time = new Date(t * 1000).toISOString()

  try {
    const { error } = await supabase.from('closes').insert({
      asset,
      timeframe: TIMEFRAME,
      candle_time,
      close_price: close,
    })

    if (error) {
      if (error.code === '23505') return // duplicate — already exists
      console.error(`[saveCandle] ${asset} @ ${candle_time}:`, error.message)
    } else {
      console.log(`✓ Saved ${asset} @ ${candle_time} = ${close}`)
    }
  } catch (err) {
    console.error(`[saveCandle] unexpected error:`, err.message)
  }
}

// ── Bybit WebSocket connection ──────────────────────────────────────────────

let bybitWs = null
let bybitReady = false
let pingInterval = null

function startBybit() {
  console.log('[Bybit] Connecting...')
  bybitWs = new WebSocket(BYBIT_WS)
  bybitReady = false

  bybitWs.on('open', () => {
    bybitReady = true
    console.log('[Bybit] Connected — subscribing to topics')
    bybitWs.send(JSON.stringify({ op: 'subscribe', args: DEFAULT_TOPICS }))

    clearInterval(pingInterval)
    pingInterval = setInterval(() => {
      if (bybitWs && bybitReady) {
        bybitWs.send(JSON.stringify({ op: 'ping' }))
      }
    }, 20_000)
  })

  bybitWs.on('message', (raw) => {
    const str = raw.toString()

    // 1. Save confirmed candles to Supabase (for ALL assets)
    try {
      const msg = JSON.parse(str)
      if (msg.topic?.startsWith('kline.') && Array.isArray(msg.data)) {
        const parts = msg.topic.split('.')
        const asset = parts[2]

        for (const k of msg.data) {
          if (k.confirm === true) {
            const rawTime = Math.floor(parseInt(k.start, 10) / 1000)
            const close = parseFloat(k.close)
            if (isFinite(rawTime) && isFinite(close)) {
              saveCandle(asset, rawTime, close)
            }
          }
        }
      }
    } catch {}

    // 2. Broadcast everything to connected browser clients
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(str)
      }
    }
  })

  bybitWs.on('close', () => {
    bybitReady = false
    clearInterval(pingInterval)
    console.log('[Bybit] Disconnected — reconnecting in 5s')
    setTimeout(startBybit, 5_000)
  })

  bybitWs.on('error', (err) => {
    console.error('[Bybit] WS error:', err.message)
  })
}

// ── Browser client connections ──────────────────────────────────────────────

wss.on('connection', (client) => {
  console.log(`[Client] Connected — active: ${wss.clients.size}`)
  client.on('close', () => {
    console.log(`[Client] Disconnected — active: ${wss.clients.size}`)
  })
  client.on('error', () => {})
})

// ── Start server ────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001

server.listen(PORT, () => {
  console.log(`\n🚀 RI Markets proxy running on port ${PORT}`)
  console.log(`   Supabase: ${SUPABASE_URL}`)
  console.log(`   Topics: ${DEFAULT_TOPICS.join(', ')}\n`)
  startBybit()
})
