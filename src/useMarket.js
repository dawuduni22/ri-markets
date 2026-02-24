import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from './supabase'
import { RSI } from 'technicalindicators'

// ── Constants ───────────────────────────────────────────────────────────────

const TIMEFRAME      = '5'
const RSI_PERIOD     = 10
const THRESHOLD_HIGH = 70
const THRESHOLD_LOW  = 30
const INTERVAL_MS    = 5 * 60 * 1000
const INTERVAL_S     = 5 * 60
const MAX_CANDLES    = 300
const LOCAL_WS       = 'wss://ri-markets-production.up.railway.app/ws'

const BOT_MIN = 2000
const BOT_MAX = 6000
const BET_MIN = 20
const BET_MAX = 300

// ── Helpers ─────────────────────────────────────────────────────────────────

const rand = (min, max) => Math.random() * (max - min) + min

export function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(mins / 60)
  const days  = Math.floor(hours / 24)
  if (days > 0)  return `${days}d ago`
  if (hours > 0) return `${hours}h ${mins % 60}m ago`
  return `${mins}m ago`
}

function isAligned(t) {
  return Number.isInteger(t) && t > 0 && (t % INTERVAL_S === 0)
}

function alignFloor(t) {
  return Math.floor(t / INTERVAL_S) * INTERVAL_S
}

function computeRsi(closes) {
  if (!Array.isArray(closes) || closes.length < RSI_PERIOD + 1) return []
  return RSI.calculate({ values: closes, period: RSI_PERIOD })
}

function mapToSorted(m) {
  return [...m.entries()].sort((a, b) => a[0] - b[0]).slice(-MAX_CANDLES)
}

// ─────────────────────────────────────────────────────────────────────────────

export function useMarket(asset = 'BTCUSDT') {

  // ── React display state ─────────────────────────────────────────────────
  const [priceData,   setPriceData]   = useState([])
  const [rsiData,     setRsiData]     = useState([])
  const [currentRsi,  setCurrentRsi]  = useState(null)
  const [livePrice,   setLivePrice]   = useState(null)
  const [priceChange, setPriceChange] = useState(0)
  const [poolHigh,    setPoolHigh]    = useState(0)
  const [poolLow,     setPoolLow]     = useState(0)
  const [status,      setStatus]      = useState('open')
  const [outcome,     setOutcome]     = useState(null)
  const [history,     setHistory]     = useState([])
  const [countdown,   setCountdown]   = useState(0)
  const [connected,   setConnected]   = useState(false)
  const [highCents,   setHighCents]   = useState(50)
  const [lowCents,    setLowCents]    = useState(50)

  // ── Mutable refs ────────────────────────────────────────────────────────
  const candleMapRef   = useRef(new Map())
  const assetRef       = useRef(asset)
  const liveCloseRef   = useRef(null)
  const liveTimeRef    = useRef(null)
  const marketIdRef    = useRef(null)
  const poolHighRef    = useRef(0)
  const poolLowRef     = useRef(0)
  const statusRef      = useRef('open')
  const wsRef          = useRef(null)
  const botRef         = useRef(null)
  const reconnectRef   = useRef(null)

  const setters = useRef({
    setPriceData, setRsiData, setCurrentRsi, setLivePrice, setPriceChange,
    setPoolHigh, setPoolLow, setStatus, setOutcome, setHistory,
    setCountdown, setConnected, setHighCents, setLowCents,
  })

  // ── RSI-driven odds pricing ─────────────────────────────────────────────
  useEffect(() => {
    const update = () => {
      const rsi = currentRsi ?? 50
      const buckets = [
        [0,  10,  2,  6], [10, 20,  5, 12], [20, 30,  8, 18],
        [30, 40, 20, 35], [40, 50, 40, 50], [50, 60, 50, 60],
        [60, 70, 65, 80], [70, 80, 82, 90], [80, 90, 88, 95],
        [90, 101, 93, 99],
      ]
      const [,, minH, maxH] = buckets.find(b => rsi >= b[0] && rsi < b[1]) ?? [50, 60, 50, 60]
      const high = Math.round(minH + Math.random() * (maxH - minH))
      setHighCents(Math.min(99, Math.max(1, high)))
      setLowCents(Math.min(99, Math.max(1, 100 - high)))
    }
    update()
    const iv = setInterval(update, 5000)
    return () => clearInterval(iv)
  }, [currentRsi])

  // ── Core: add one confirmed candle to the map ───────────────────────────
  const addClosedCandle = useCallback((rawTime, close) => {
    const t = isAligned(rawTime) ? rawTime : alignFloor(rawTime)
    if (!t || !isFinite(close) || close <= 0) return null
    if (candleMapRef.current.has(t) && candleMapRef.current.get(t) === close) return null
    candleMapRef.current.set(t, close)
    if (candleMapRef.current.size > MAX_CANDLES) {
      const oldest = mapToSorted(candleMapRef.current)[0][0]
      candleMapRef.current.delete(oldest)
    }
    return t
  }, [])

  // ── Derive React state from the candle map ──────────────────────────────
  const flushToState = useCallback((assetId) => {
    if (assetId !== assetRef.current) return null
    const { setPriceData: spd, setRsiData: srd, setCurrentRsi: scr,
            setLivePrice: slp, setPriceChange: spc } = setters.current

    const sorted = mapToSorted(candleMapRef.current)
    if (sorted.length === 0) { spd([]); srd([]); scr(null); return null }

    const times  = sorted.map(([t]) => t)
    const closes = sorted.map(([, c]) => c)

    spd(sorted.map(([t, c]) => ({ time: t, value: c })))
    if (closes.length >= 2) {
      spc(((closes.at(-1) - closes[0]) / closes[0]) * 100)
      slp(closes.at(-1))
    }
    if (closes.length < RSI_PERIOD + 1) { srd([]); scr(null); return null }

    const rsiValues = computeRsi(closes)
    if (!rsiValues.length) return null

    const offset = closes.length - rsiValues.length
    const rsiPoints = rsiValues.map((v, i) => ({ time: times[offset + i], value: v }))
    srd(rsiPoints)
    const latest = rsiValues.at(-1)
    scr(latest)
    return latest
  }, [])

  // ── Market open / resolve ───────────────────────────────────────────────
  const openMarket = useCallback(async (assetId) => {
    const { data, error } = await supabase
      .from('markets')
      .insert({
        asset: assetId, indicator: 'RSI', period: RSI_PERIOD,
        timeframe: TIMEFRAME, threshold_high: THRESHOLD_HIGH,
        threshold_low: THRESHOLD_LOW, pool_high: 0, pool_low: 0, status: 'open',
      })
      .select().single()
    if (error) { console.error('openMarket:', error); return }
    marketIdRef.current = data.id
    poolHighRef.current = 0; poolLowRef.current = 0; statusRef.current = 'open'
    setters.current.setPoolHigh(0); setters.current.setPoolLow(0)
    setters.current.setStatus('open'); setters.current.setOutcome(null)
  }, [])

  const resolveMarket = useCallback(async (outcomeVal, rsiVal, candleTimeMs, assetId) => {
    if (!marketIdRef.current || statusRef.current !== 'open') return
    statusRef.current = 'resolved'
    setters.current.setStatus('resolved'); setters.current.setOutcome(outcomeVal)
    await supabase.from('markets').update({
      status: 'resolved', outcome: outcomeVal,
      resolved_at: new Date().toISOString(), resolution_value: rsiVal,
      resolution_candle_time: new Date(candleTimeMs).toISOString(),
      pool_high: poolHighRef.current, pool_low: poolLowRef.current,
    }).eq('id', marketIdRef.current)
    setters.current.setHistory(prev => [{
      id: marketIdRef.current, outcome: outcomeVal,
      pool_high: poolHighRef.current, pool_low: poolLowRef.current,
      resolved_at: new Date().toISOString(), resolution_value: rsiVal,
    }, ...prev].slice(0, 20))
    setTimeout(() => openMarket(assetId), 5000)
  }, [openMarket])

  // ── Bot simulation ──────────────────────────────────────────────────────
  const placeBet = useCallback(async () => {
    if (statusRef.current !== 'open' || !marketIdRef.current) {
      botRef.current = setTimeout(placeBet, rand(BOT_MIN, BOT_MAX)); return
    }
    const closes = mapToSorted(candleMapRef.current).map(([, c]) => c)
    const rsi = computeRsi(closes).at(-1) ?? 50
    const side = Math.random() < Math.min(0.8, Math.max(0.2, rsi / 100)) ? 'high' : 'low'
    const amount = Math.round(rand(BET_MIN, BET_MAX))
    if (side === 'high') { poolHighRef.current += amount; setters.current.setPoolHigh(poolHighRef.current) }
    else { poolLowRef.current += amount; setters.current.setPoolLow(poolLowRef.current) }
    await supabase.from('markets').update({
      pool_high: poolHighRef.current, pool_low: poolLowRef.current,
    }).eq('id', marketIdRef.current)
    await supabase.from('bets').insert({ market_id: marketIdRef.current, side, amount })
    botRef.current = setTimeout(placeBet, rand(BOT_MIN, BOT_MAX))
  }, [])

  // ── WS: confirmed closed candle ─────────────────────────────────────────
  const onCandleClose = useCallback((rawTime, close, assetId) => {
    if (assetId !== assetRef.current) return
    const t = addClosedCandle(rawTime, close)
    if (t === null) return
    const latestRsi = flushToState(assetId)
    if (latestRsi == null || statusRef.current !== 'open') return
    if (latestRsi >= THRESHOLD_HIGH)     resolveMarket('OVERBOUGHT', latestRsi, t * 1000, assetId)
    else if (latestRsi <= THRESHOLD_LOW) resolveMarket('OVERSOLD',   latestRsi, t * 1000, assetId)
  }, [addClosedCandle, flushToState, resolveMarket])

  // ── WS: live tick — display only ────────────────────────────────────────
  const onLiveTick = useCallback((rawTime, close, assetId) => {
    if (assetId !== assetRef.current) return
    if (!isFinite(close) || close <= 0) return
    const t = isAligned(rawTime) ? rawTime : alignFloor(rawTime)
    if (candleMapRef.current.has(t)) return

    liveCloseRef.current = close; liveTimeRef.current = t
    setters.current.setLivePrice(close)

    const sorted = mapToSorted(candleMapRef.current)
    const lastConfirmed = sorted.at(-1)?.[0] ?? 0
    if (t <= lastConfirmed) return

    setters.current.setPriceData([
      ...sorted.map(([ts, c]) => ({ time: ts, value: c })),
      { time: t, value: close },
    ])

    const closes = sorted.map(([, c]) => c)
    if (closes.length >= RSI_PERIOD + 1) {
      const times = sorted.map(([ts]) => ts)
      const allRsi = computeRsi([...closes, close])
      if (allRsi.length >= 2) {
        const offset = closes.length - allRsi.length + 1
        const rsiPoints = allRsi.slice(0, -1).map((v, i) => ({
          time: times[offset + i], value: v,
        })).filter(p => p.time != null)
        rsiPoints.push({ time: t, value: allRsi.at(-1) })
        setters.current.setRsiData(rsiPoints)
        setters.current.setCurrentRsi(allRsi.at(-1))
      }
    }
  }, [])

  // ── WebSocket — stable ──────────────────────────────────────────────────
  const connectWs = useCallback(() => {
    clearTimeout(reconnectRef.current)
    const state = wsRef.current?.readyState
    if (state === WebSocket.CONNECTING || state === WebSocket.OPEN) return

    try {
      const ws = new WebSocket(LOCAL_WS)
      wsRef.current = ws
      ws.onopen = () => setters.current.setConnected(true)
      ws.onerror = () => {}
      ws.onclose = () => {
        setters.current.setConnected(false)
        if (wsRef.current === ws) reconnectRef.current = setTimeout(connectWs, 5000)
      }
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (!msg?.data) return
          if (msg.topic?.startsWith('kline.')) {
            const topicAsset = msg.topic.split('.')[2]
            const k = Array.isArray(msg.data) ? msg.data[0] : msg.data
            if (!k) return
            const rawTime = Math.floor(parseInt(k.start, 10) / 1000)
            const close = parseFloat(k.close)
            if (!isFinite(rawTime) || !isFinite(close)) return
            if (topicAsset === assetRef.current) {
              const end = parseInt(k.start, 10) + INTERVAL_MS
              setters.current.setCountdown(Math.max(0, Math.floor((end - Date.now()) / 1000)))
            }
            if (k.confirm === true) onCandleClose(rawTime, close, topicAsset)
            else onLiveTick(rawTime, close, topicAsset)
          }
          if (msg.topic?.startsWith('tickers.')) {
            const topicAsset = msg.topic.split('.')[1]
            if (topicAsset === assetRef.current) {
              const p = parseFloat(msg.data?.lastPrice)
              if (isFinite(p) && p > 0) setters.current.setLivePrice(p)
            }
          }
        } catch {}
      }
    } catch (err) {
      console.error('connectWs:', err.message)
      reconnectRef.current = setTimeout(connectWs, 5000)
    }
  }, [onCandleClose, onLiveTick])

  // ── Load candles from Supabase ──────────────────────────────────────────
  const loadStoredCloses = useCallback(async (assetId) => {
    try {
      const { data, error } = await supabase
        .from('closes')
        .select('candle_time, close_price')
        .eq('asset', assetId)
        .eq('timeframe', TIMEFRAME)
        .order('candle_time', { ascending: true })
        .limit(MAX_CANDLES)
      if (error) { console.error('loadStoredCloses error:', error.message); return false }
      if (!data || data.length === 0) {
        console.warn(`${assetId}: no rows in Supabase closes table yet`)
        return false
      }
      for (const row of data) {
        const t = Math.floor(new Date(row.candle_time).getTime() / 1000)
        const close = parseFloat(row.close_price)
        addClosedCandle(t, close)
      }
      if (candleMapRef.current.size === 0) return false
      flushToState(assetId)
      console.log(`${assetId}: loaded ${candleMapRef.current.size} candles from Supabase`)
      return true
    } catch (e) {
      console.error('loadStoredCloses:', e.message)
      return false
    }
  }, [addClosedCandle, flushToState])

  // ── Boot / asset-switch ─────────────────────────────────────────────────
  useEffect(() => {
    assetRef.current = asset
    setPriceData([]); setRsiData([]); setCurrentRsi(null)
    setLivePrice(null); setPriceChange(0)
    setPoolHigh(0); setPoolLow(0); setStatus('open'); setOutcome(null)
    setHistory([]); setCountdown(0); setHighCents(50); setLowCents(50)

    candleMapRef.current = new Map()
    liveCloseRef.current = null; liveTimeRef.current = null
    marketIdRef.current = null; poolHighRef.current = 0; poolLowRef.current = 0
    statusRef.current = 'open'

    clearTimeout(botRef.current); clearTimeout(reconnectRef.current)
    if (wsRef.current) {
      wsRef.current.onclose = null; wsRef.current.close(); wsRef.current = null
    }

    let cancelled = false
    const init = async () => {
      await loadStoredCloses(asset)
      if (cancelled) return
      connectWs()
      openMarket(asset)
      botRef.current = setTimeout(placeBet, rand(BOT_MIN, BOT_MAX))
    }
    init()

    return () => {
      cancelled = true
      clearTimeout(botRef.current); clearTimeout(reconnectRef.current)
      if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close() }
    }
  }, [asset]) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    priceData, rsiData, currentRsi,
    livePrice, priceChange,
    poolHigh, poolLow, highCents, lowCents,
    total: poolHigh + poolLow,
    status, outcome, history,
    countdown, connected,
    timeAgo,
    THRESHOLD_HIGH, THRESHOLD_LOW, RSI_PERIOD, ASSET: asset, TIMEFRAME,
  }
}
