import { useState } from 'react'
import { useMarket } from './useMarket'
import Chart from './Chart'
import './App.css'

/* ── Icons ─────────────────────────────────────────────────────────────────
   Inline SVG rather than ▲ ▼ ✓ ✕ glyphs, which render differently on every
   platform and are the fastest way to make an interface look unfinished. */
function Caret({ dir = 'up', size = 9 }) {
  return (
    <svg className="caret" width={size} height={size} viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path
        d={dir === 'up' ? 'M5 2.5 9 7.5H1z' : 'M5 7.5 1 2.5h8z'}
        fill="currentColor"
      />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 8.5l3.5 3.5L13 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/* ── Formatters ───────────────────────────────────────────────────────────── */
function fmt(n) {
  return n >= 1000 ? '$' + (n / 1000).toFixed(1) + 'k' : '$' + Math.round(n)
}

function fmtPrice(n, decimals = 2) {
  if (!n) return '---'
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function fmtCountdown(secs) {
  const m = String(Math.floor(secs / 60)).padStart(2, '0')
  const s = String(secs % 60).padStart(2, '0')
  return `${m}:${s}`
}

const ASSETS = [
  { id: 'BTCUSDT',  label: 'BTC',  name: 'Bitcoin', pair: 'BTC/USDT',  decimals: 2 },
  { id: 'XAUTUSDT', label: 'Gold', name: 'Gold',    pair: 'XAUT/USDT', decimals: 2 },
]

const ABOUT_SECTIONS = [
  {
    q: 'What is a Relative Index Market?',
    paras: [
      'A Relative Index Market is a trading format that resolves on a technical indicator, the Relative Strength Index (RSI), rather than on price targets or preset expiration times.',
      'Instead of trading how far price moves, you are trading which direction reaches real strength first.',
    ],
  },
  {
    q: 'How does it work?',
    paras: [
      'Each market tracks RSI(10) on closed 5-minute candles. A market resolves the moment one of these conditions is met on a fully closed candle.',
    ],
    defs: [
      { side: 'high', term: 'Relative High', value: 'RSI 70 or above' },
      { side: 'low',  term: 'Relative Low',  value: 'RSI 30 or below' },
    ],
    after: 'Whichever threshold is reached first determines the outcome, and the market closes on that candle. There is no price target and no countdown.',
  },
  {
    q: 'What are you actually taking a position on?',
    paras: [
      'Which momentum extreme arrives first. That isolates direction from distance and from time decay. Whether price moves $10 or $1,000 does not change the outcome, only whether RSI reaches the upper or lower level.',
    ],
  },
  {
    q: 'Where does the data come from?',
    paras: [
      'Price data is streamed live from public market feeds and RSI is calculated on the server from closed candles. No account or API key is needed to view or take part in the demo.',
    ],
  },
  {
    q: 'Is there a time limit?',
    paras: [
      'No. Markets stay open until RSI reaches 70 or 30 on a closed 5-minute candle. That can take minutes or several hours.',
    ],
  },
  {
    q: 'What markets are available?',
    defs: [
      { term: 'BTC/USDT',  value: 'Bitcoin' },
      { term: 'XAUT/USDT', value: 'Tokenized gold' },
    ],
    after: 'More may be added over time.',
  },
]

function AboutPanel({ onClose }) {
  return (
    <div className="about-backdrop" onClick={onClose}>
      <div className="about-panel" onClick={e => e.stopPropagation()}>
        <div className="about-header">
          <div className="about-title">About RI Markets</div>
          <button className="about-close" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        <div className="about-qa">
          {ABOUT_SECTIONS.map((section, i) => (
            <div className="about-item" key={i}>
              <div className="about-q">{section.q}</div>
              {section.paras && section.paras.map((p, j) => (
                <div className="about-a" key={j}>{p}</div>
              ))}
              {section.defs && (
                <dl className="about-defs">
                  {section.defs.map((d, j) => (
                    <div className="about-def" key={j}>
                      <dt className={d.side === 'high' ? 'g' : d.side === 'low' ? 'r' : ''}>
                        {d.side && <Caret dir={d.side === 'high' ? 'up' : 'down'} />}
                        {d.term}
                      </dt>
                      <dd>{d.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {section.after && <div className="about-a">{section.after}</div>}
            </div>
          ))}
        </div>

        <div className="about-disclaimer">
          <strong>Demo environment</strong>
          Everything here is simulated. No real funds are involved. Pool sizes, odds, and positions are illustrative and do not reflect live liquidity or real execution.
        </div>
      </div>
    </div>
  )
}

/* ── Positions ────────────────────────────────────────────────────────────── */
function PositionsPanel({ positions, highCents, lowCents, onClose }) {
  if (positions.length === 0) return null

  return (
    <div className="positions-panel">
      <div className="positions-header">
        <span className="positions-title">Open positions ({positions.length})</span>
        <span className="demo-tag">Simulated</span>
      </div>
      <div className="positions-table">
        <div className="positions-row positions-row--head">
          <span>Side</span>
          <span>Market</span>
          <span>Size</span>
          <span>Entry</span>
          <span>Current</span>
          <span>Profit and loss</span>
          <span></span>
        </div>
        {positions.map(pos => {
          const currentCents = pos.side === 'high' ? highCents : lowCents
          const pnlPct = pos.entryCents > 0 ? ((currentCents - pos.entryCents) / pos.entryCents) * 100 : 0
          const pnl = pnlPct * (pos.amount / 100)
          const isPositive = pnl >= 0

          return (
            <div className="positions-row" key={pos.id}>
              <span className={`positions-side ${pos.side === 'high' ? 'g' : 'r'}`}>
                <Caret dir={pos.side === 'high' ? 'up' : 'down'} />
                {pos.side === 'high' ? 'High' : 'Low'}
              </span>
              <span>{pos.assetLabel}</span>
              <span className="num">${pos.amount.toFixed(2)}</span>
              <span className="num">{pos.entryCents}&cent;</span>
              <span className="num">{currentCents}&cent;</span>
              <span className={`num ${isPositive ? 'g' : 'r'}`}>
                {isPositive ? '+' : ''}{pnl.toFixed(2)} ({isPositive ? '+' : ''}{pnlPct.toFixed(1)}%)
              </span>
              <span>
                <button className="positions-close-btn" onClick={() => onClose(pos.id)}>Close</button>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── App ──────────────────────────────────────────────────────────────────── */
export default function App() {
  const [activeAsset, setActiveAsset] = useState('BTCUSDT')
  const [aboutOpen, setAboutOpen]     = useState(false)
  const [selected, setSelected]       = useState(null)
  const [amount, setAmount]           = useState('')
  const [confirmed, setConfirmed]     = useState(false)
  const [positions, setPositions]     = useState([])

  const assetInfo = ASSETS.find(a => a.id === activeAsset) ?? ASSETS[0]

  const {
    priceData, rsiData, currentRsi,
    livePrice, priceChange,
    poolHigh, poolLow, highCents, lowCents, total,
    status, outcome,
    countdown, connected,
    THRESHOLD_HIGH, THRESHOLD_LOW, RSI_PERIOD, TIMEFRAME,
  } = useMarket(activeAsset)

  const rsi    = currentRsi !== null ? currentRsi.toFixed(1) : '--'
  const isHigh = currentRsi !== null && currentRsi >= THRESHOLD_HIGH
  const isLow  = currentRsi !== null && currentRsi <= THRESHOLD_LOW

  /* High is green and Low is red everywhere in the interface, matching the
     side buttons. The meter used to invert this and it read as a bug. */
  const zoneColor = isHigh ? 'var(--high)' : isLow ? 'var(--low)' : 'var(--accent)'

  const cents  = selected === 'high' ? highCents : lowCents
  const amt    = parseFloat(amount) || 0
  const payout = amt > 0 && cents > 0 ? (amt * (100 / cents)).toFixed(2) : null
  const profit = amt > 0 && cents > 0 ? (amt * (100 / cents) - amt).toFixed(2) : null

  const activePositions = positions.filter(p => p.asset === activeAsset)

  function switchAsset(id) { setActiveAsset(id); setSelected(null); setAmount(''); setConfirmed(false) }
  function selectSide(side) {
    if (selected === side) { setSelected(null); setAmount(''); setConfirmed(false) }
    else { setSelected(side); setAmount(''); setConfirmed(false) }
  }

  function handleConfirm() {
    if (amt <= 0) return

    const entryCents = selected === 'high' ? highCents : lowCents

    const newPosition = {
      id: Date.now().toString(),
      asset: activeAsset,
      assetLabel: assetInfo.label,
      side: selected,
      amount: amt,
      entryCents,
      openedAt: new Date().toISOString(),
    }
    setPositions(prev => [newPosition, ...prev])

    setConfirmed(true)
    setTimeout(() => { setConfirmed(false); setSelected(null); setAmount('') }, 2500)
  }

  function closePosition(id) {
    setPositions(prev => prev.filter(p => p.id !== id))
  }

  return (
    <>
      <nav className="nav">
        <div className="nav-left">
          <div className="logo">RI Markets</div>
        </div>
        <div className="nav-center">
          {ASSETS.map(a => (
            <button key={a.id}
              className={`asset-tab ${activeAsset === a.id ? 'active' : ''}`}
              onClick={() => switchAsset(a.id)}>
              {a.label}
            </button>
          ))}
        </div>
        <div className="nav-links">
          <button className="nav-link active">Markets</button>
          <button className="nav-link" onClick={() => setAboutOpen(true)}>About</button>
        </div>
      </nav>

      <div className="layout">
        <div className="chart-area">
          <div className="chart-header">
            <span className="pair">{assetInfo.pair} · {TIMEFRAME}m · RSI({RSI_PERIOD})</span>
            <div className="price-display">
              <span className="price num">{fmtPrice(livePrice, assetInfo.decimals)}</span>
              <span className={`change num ${priceChange >= 0 ? 'up' : 'down'}`}>
                {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
              </span>
            </div>
          </div>

          <div className="chart-wrap">
            <Chart priceData={priceData} rsiData={rsiData} />
            {status === 'resolved' && outcome && (
              <div className="resolved-overlay">
                <div className={`resolved-badge ${outcome === 'OVERBOUGHT' ? 'high' : 'low'}`}>
                  <Caret dir={outcome === 'OVERBOUGHT' ? 'up' : 'down'} size={11} />
                  {outcome === 'OVERBOUGHT' ? 'Relative High' : 'Relative Low'}
                </div>
                <div className="resolved-sub">
                  RSI({RSI_PERIOD}) threshold reached. New market opening shortly.
                </div>
              </div>
            )}
          </div>

          <PositionsPanel
            positions={activePositions}
            highCents={highCents}
            lowCents={lowCents}
            onClose={closePosition}
          />
        </div>

        <div className="right-panel">
          <div className="market-header">
            <div className="market-title">{assetInfo.name} · RSI({RSI_PERIOD}) · {TIMEFRAME}m</div>
            <div className="market-sub">Which extreme closes first. No expiry.</div>
          </div>

          {/* RSI meter. The 30 and 70 marks sit at their true positions on the
              track so the fill can be read against them at a glance. */}
          <div className="rsi-live">
            <div className="rsi-top">
              <span className="rsi-label">Live RSI({RSI_PERIOD})</span>
              <span className="rsi-value num" style={{ color: zoneColor }}>{rsi}</span>
            </div>

            <div className="rsi-track">
              <div className="rsi-fill" style={{ width: `${currentRsi ?? 50}%`, background: zoneColor }} />
              <div className="rsi-threshold" style={{ left: `${THRESHOLD_LOW}%` }} />
              <div className="rsi-threshold" style={{ left: `${THRESHOLD_HIGH}%` }} />
            </div>

            <div className="rsi-ticks num">
              <span className="tick tick-start" style={{ left: '0%' }}>0</span>
              <span className="tick t-low" style={{ left: `${THRESHOLD_LOW}%` }}>{THRESHOLD_LOW}</span>
              <span className="tick t-high" style={{ left: `${THRESHOLD_HIGH}%` }}>{THRESHOLD_HIGH}</span>
              <span className="tick tick-end" style={{ left: '100%' }}>100</span>
            </div>

            <span className={`rsi-zone ${isHigh ? 'zone-high' : isLow ? 'zone-low' : 'zone-neutral'}`}>
              {isHigh ? 'Relative High' : isLow ? 'Relative Low' : 'Neutral'}
            </span>

            {currentRsi === null && (
              <div className="rsi-loading">Waiting for {RSI_PERIOD} closes</div>
            )}
          </div>

          <div className="pool-section">
            <div className="pool-row">
              <span className="pool-side g"><Caret dir="up" />Relative High</span>
              <span className="g num">{fmt(poolHigh)} · {highCents}%</span>
            </div>
            <div className="pool-row">
              <span className="pool-side r"><Caret dir="down" />Relative Low</span>
              <span className="r num">{fmt(poolLow)} · {lowCents}%</span>
            </div>
            <div className="pool-bar">
              <div className="g" style={{ width: `${highCents}%` }} />
              <div className="r" style={{ width: `${lowCents}%` }} />
            </div>
            <div className="pool-total num">Total pool {fmt(total)} USDC, simulated</div>
          </div>

          <div className="trade-section">
            <div className="trade-question">Which extreme does RSI({RSI_PERIOD}) reach first?</div>

            <div className="trade-sides">
              <button className={`trade-side-btn high ${selected === 'high' ? 'active' : ''}`}
                onClick={() => selectSide('high')}>
                <span className="tsb-label"><Caret dir="up" />Relative High</span>
                <span className="tsb-price num">{highCents}&cent;</span>
              </button>
              <button className={`trade-side-btn low ${selected === 'low' ? 'active' : ''}`}
                onClick={() => selectSide('low')}>
                <span className="tsb-label"><Caret dir="down" />Relative Low</span>
                <span className="tsb-price num">{lowCents}&cent;</span>
              </button>
            </div>

            {selected && !confirmed && (
              <div className="trade-entry">
                <div className="trade-sub">
                  Resolves when RSI reaches {selected === 'high' ? THRESHOLD_HIGH : THRESHOLD_LOW} on a closed {TIMEFRAME}m candle
                </div>

                <div className="trade-input-row">
                  <label className="trade-input-label" htmlFor="trade-amount">Amount in USDC</label>
                  <div className="trade-input-wrap">
                    <span className="trade-currency">$</span>
                    <input id="trade-amount" className="trade-input" type="number" min="1" placeholder="0.00"
                      value={amount} onChange={e => setAmount(e.target.value)} autoFocus />
                  </div>
                </div>

                {payout && (
                  <div className="trade-payout">
                    <div className="trade-payout-row"><span>Entry</span><span className="num">${amt.toFixed(2)}</span></div>
                    <div className="trade-payout-row"><span>Payout if correct</span><span className="g num">${payout}</span></div>
                    <div className="trade-payout-row"><span>Profit if correct</span><span className="g num">+${profit}</span></div>
                    <div className="trade-payout-row"><span>Odds</span><span className="num">{cents}&cent; · {(100 / cents).toFixed(2)}x</span></div>
                  </div>
                )}

                <div className="demo-note">Demo mode. No real funds are used.</div>

                <button className={`trade-confirm ${selected === 'high' ? 'high' : 'low'}`}
                  disabled={!payout} onClick={handleConfirm}>
                  Place demo order · ${amt > 0 ? amt.toFixed(2) : '0.00'}
                </button>
              </div>
            )}

            {confirmed && (
              <div className="trade-success">
                <span className="trade-success-icon"><CheckIcon /></span>
                <div>
                  <div className="trade-success-title">Demo order filled</div>
                  <div className="trade-success-sub">Position is open below the chart. Simulated only.</div>
                </div>
              </div>
            )}
          </div>

          <div className="status-bar">
            <div className="dot" style={{ background: connected ? 'var(--high)' : 'var(--low)' }} />
            <span>
              {connected ? `Live · ${assetInfo.pair}` : 'Reconnecting'} · Next close{' '}
              <span className="countdown">{fmtCountdown(countdown)}</span>
            </span>
          </div>
        </div>
      </div>

      {aboutOpen && <AboutPanel onClose={() => setAboutOpen(false)} />}
    </>
  )
}
