import { useState } from 'react'
import { useMarket } from './useMarket'
import Chart from './Chart'
import './App.css'

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
  { id: 'BTCUSDT',  label: 'BTC (Bitcoin)',  name: 'Bitcoin',  decimals: 2 },
  { id: 'XAUTUSDT', label: 'GOLD',           name: 'Gold',     decimals: 2 },
]

const ABOUT_SECTIONS = [
  {
    q: 'What is a Relative Index Market?',
    paras: [
      'A Relative Index Market is a trading format that resolves based entirely on a technical indicator — the Relative Strength Index (RSI) — rather than on price targets or preset expiration times.',
      'Instead of focusing on how far price moves, you are trading the directional outcome of momentum reaching a defined extreme.',
    ],
  },
  {
    q: 'How does it work?',
    paras: [
      'Each market tracks RSI(10) calculated on closed 5-minute candles.',
      'A market resolves when one of the following conditions is met on a fully closed candle:',
    ],
    bullets: ['Relative High → RSI ≥ 70', 'Relative Low → RSI ≤ 30'],
    after: 'Whichever threshold is reached first determines the outcome, and the market closes immediately after that candle confirms. There is no price target and no countdown timer. Resolution depends solely on momentum reaching a defined level.',
  },
  {
    q: 'What are the two sides?',
    bullets: ['Relative High (RSI ≥ 70)', 'Relative Low (RSI ≤ 30)'],
    after: 'You are taking a position on which momentum extreme is reached first. This structure isolates directional momentum, not price distance or time decay. Whether price moves $10 or $1,000 is irrelevant — only whether RSI reaches an upper or lower extreme matters.',
  },
  {
    q: 'Where does the data come from?',
    paras: [
      "All price data used to calculate RSI is sourced in real time from aggregated public market feeds.",
      'No account or API key is required to view or participate in the demo environment.',
    ],
  },
  {
    q: 'Is there a time limit?',
    paras: [
      'No. Markets remain open until RSI reaches 70 or 30 on a closed 5-minute candle. This could occur within minutes or take several hours, depending on market conditions.',
    ],
  },
  {
    q: 'What assets are available?',
    bullets: ['BTC/USDT', 'XAUT/USDT (tokenized gold)'],
    after: 'Additional markets may be introduced over time.',
  },
]

function AboutPanel({ onClose }) {
  return (
    <div className="about-backdrop" onClick={onClose}>
      <div className="about-panel" onClick={e => e.stopPropagation()}>
        <div className="about-header">
          <div className="about-title">About <span>RIM</span></div>
          <button className="about-close" onClick={onClose}>✕</button>
        </div>
        <div className="about-qa">
          {ABOUT_SECTIONS.map((section, i) => (
            <div className="about-item" key={i}>
              <div className="about-q">{section.q}</div>
              {section.paras && section.paras.map((p, j) => (
                <div className="about-a" key={j}>{p}</div>
              ))}
              {section.bullets && (
                <ul className="about-bullets">
                  {section.bullets.map((b, j) => <li key={j}>{b}</li>)}
                </ul>
              )}
              {section.after && <div className="about-a">{section.after}</div>}
            </div>
          ))}
        </div>
        <div className="about-disclaimer">
          <strong>Disclaimer</strong><br/>
          This platform is a demonstration environment only. All activity is simulated and does not involve real funds. Displayed outcomes, liquidity, and movements are generated for illustrative purposes and do not reflect live market conditions. This demo does not represent actual trading infrastructure or real market execution.
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [activeAsset, setActiveAsset] = useState('BTCUSDT')
  const [aboutOpen, setAboutOpen]     = useState(false)
  const [selected, setSelected]       = useState(null)
  const [amount, setAmount]           = useState('')
  const [confirmed, setConfirmed]     = useState(false)

  const assetInfo = ASSETS.find(a => a.id === activeAsset) ?? ASSETS[0]

  const {
    priceData, rsiData, currentRsi,
    livePrice, priceChange,
    poolHigh, poolLow, highCents, lowCents, total,
    status, outcome,
    countdown, connected,
    THRESHOLD_HIGH, THRESHOLD_LOW, RSI_PERIOD, TIMEFRAME,
  } = useMarket(activeAsset)

  const rsi      = currentRsi !== null ? currentRsi.toFixed(1) : '--'
  const isHigh   = currentRsi !== null && currentRsi >= THRESHOLD_HIGH
  const isLow    = currentRsi !== null && currentRsi <= THRESHOLD_LOW
  const rsiColor = isHigh ? 'var(--red)' : isLow ? 'var(--green)' : 'var(--accent)'
  const barColor = isHigh
    ? 'linear-gradient(90deg, var(--accent), var(--red))'
    : isLow
    ? 'linear-gradient(90deg, var(--accent), var(--green))'
    : 'linear-gradient(90deg, var(--accent), var(--accent-light))'

  const cents   = selected === 'high' ? highCents : lowCents
  const amt     = parseFloat(amount) || 0
  const payout  = amt > 0 && cents > 0 ? (amt * (100 / cents)).toFixed(2) : null
  const profit  = amt > 0 && cents > 0 ? (amt * (100 / cents) - amt).toFixed(2) : null

  function switchAsset(id) { setActiveAsset(id); setSelected(null); setAmount(''); setConfirmed(false) }
  function selectSide(side) {
    if (selected === side) { setSelected(null); setAmount(''); setConfirmed(false) }
    else { setSelected(side); setAmount(''); setConfirmed(false) }
  }
  function handleConfirm() {
    setConfirmed(true)
    setTimeout(() => { setConfirmed(false); setSelected(null); setAmount('') }, 3500)
  }

  return (
    <>
      <nav className="nav">
        <div className="nav-left">
          <div className="logo">RI<span>MARKET</span></div>
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
          <a href="#" className="active">Markets</a>
          <a href="#" onClick={e => { e.preventDefault(); setAboutOpen(true) }}>About</a>
        </div>
      </nav>

      <div className="layout">
        <div className="chart-area">
          <div className="chart-header">
            <span className="pair">{assetInfo.label}/USDT · {TIMEFRAME}m · RSI({RSI_PERIOD})</span>
            <div className="price-display">
              <span className="price">{fmtPrice(livePrice, assetInfo.decimals)}</span>
              <span className={`change ${priceChange >= 0 ? 'up' : 'down'}`}>
                {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
              </span>
            </div>
          </div>
          <div className="chart-wrap">
            <Chart priceData={priceData} rsiData={rsiData} />
            {status === 'resolved' && outcome && (
              <div className="resolved-overlay">
                <div className={`resolved-badge ${outcome === 'OVERBOUGHT' ? 'green' : 'red'}`}>
                  {outcome === 'OVERBOUGHT' ? '▲ RELATIVE HIGH' : '▼ RELATIVE LOW'}
                </div>
                <div className="resolved-sub">RSI({RSI_PERIOD}) threshold reached · New market opening soon</div>
              </div>
            )}
          </div>
        </div>

        <div className="right-panel">
          <div className="market-header">
            <div className="market-title">{assetInfo.label} RSI({RSI_PERIOD}) · {TIMEFRAME}m</div>
            <div className="market-sub">Which relative extreme closes first? · No expiry</div>
          </div>

          <div className="rsi-live">
            <div className="rsi-label">Live RSI({RSI_PERIOD})</div>
            <div className="rsi-value" style={{ color: rsiColor }}>
              {rsi}
              {currentRsi === null && <span className="rsi-loading"> — waiting for {RSI_PERIOD} closes</span>}
            </div>
            <div className="rsi-bar-wrap">
              <div className="rsi-bar" style={{ width: `${currentRsi ?? 50}%`, background: barColor }} />
            </div>
            <div className="rsi-ticks">
              <span>0</span>
              <span style={{ color: 'var(--green)' }}>30 ▼</span>
              <span style={{ color: 'var(--red)' }}>70 ▲</span>
              <span>100</span>
            </div>
            <span className={`rsi-zone ${isHigh ? 'zone-over' : isLow ? 'zone-under' : 'zone-neutral'}`}>
              {isHigh ? 'RELATIVE HIGH' : isLow ? 'RELATIVE LOW' : 'NEUTRAL'}
            </span>
          </div>

          <div className="pool-section">
            <div className="pool-row">
              <span className="g">▲ RELATIVE HIGH</span>
              <span className="g">{fmt(poolHigh)} · {highCents}%</span>
            </div>
            <div className="pool-row">
              <span className="r">▼ RELATIVE LOW</span>
              <span className="r">{fmt(poolLow)} · {lowCents}%</span>
            </div>
            <div className="pool-bar">
              <div className="g" style={{ width: `${highCents}%` }} />
              <div className="r" style={{ width: `${lowCents}%` }} />
            </div>
            <div className="pool-total">Total pool: {fmt(total)} USDC (demo)</div>
          </div>

          <div className="trade-section">
            <div className="trade-question">Which relative extreme does RSI({RSI_PERIOD}) reach first?</div>
            <div className="trade-sides">
              <button className={`trade-side-btn green ${selected === 'high' ? 'active' : ''}`}
                onClick={() => selectSide('high')}>
                <span className="tsb-label">▲ Relative High</span>
                <span className="tsb-price">{highCents}¢</span>
              </button>
              <button className={`trade-side-btn red ${selected === 'low' ? 'active' : ''}`}
                onClick={() => selectSide('low')}>
                <span className="tsb-label">▼ Relative Low</span>
                <span className="tsb-price">{lowCents}¢</span>
              </button>
            </div>

            {selected && !confirmed && (
              <div className="trade-entry">
                <div className="trade-sub">
                  RSI {selected === 'high' ? `≥ ${THRESHOLD_HIGH}` : `≤ ${THRESHOLD_LOW}`} on a closed 5m candle
                </div>
                <div className="trade-input-row">
                  <label className="trade-input-label">Amount (USDC)</label>
                  <div className="trade-input-wrap">
                    <span className="trade-currency">$</span>
                    <input className="trade-input" type="number" min="1" placeholder="0.00"
                      value={amount} onChange={e => setAmount(e.target.value)} autoFocus />
                  </div>
                </div>
                {payout && (
                  <div className="trade-payout">
                    <div className="trade-payout-row"><span>Entry</span><span>${amt.toFixed(2)}</span></div>
                    <div className="trade-payout-row"><span>Potential payout</span><span className="g">${payout}</span></div>
                    <div className="trade-payout-row"><span>Potential profit</span><span className="g">+${profit}</span></div>
                    <div className="trade-payout-row"><span>Odds</span><span>{cents}¢ · {(100 / cents).toFixed(2)}x</span></div>
                  </div>
                )}
                <div className="trade-demo-notice">⚠ Demo mode — no real funds are used</div>
                <button className={`trade-confirm ${selected === 'high' ? 'green' : 'red'}`}
                  disabled={!payout} onClick={handleConfirm}>
                  Place Demo Order · ${amt > 0 ? amt.toFixed(2) : '0.00'}
                </button>
              </div>
            )}

            {confirmed && (
              <div className="trade-success">
                <span className="trade-success-icon">✓</span>
                <div>
                  <div className="trade-success-title">Demo Order Placed</div>
                  <div className="trade-success-sub">Simulated trade only. No real funds used. Live trading coming at launch.</div>
                </div>
              </div>
            )}
          </div>

          <div className="status-bar">
            <div className="dot" style={{ background: connected ? 'var(--green)' : 'var(--red)' }} />
            <span>
              {connected ? `Live · ${assetInfo.label}` : 'Reconnecting...'} · Next close{' '}
              <span className="countdown">{fmtCountdown(countdown)}</span>
            </span>
          </div>
        </div>
      </div>

      {aboutOpen && <AboutPanel onClose={() => setAboutOpen(false)} />}
    </>
  )
}
