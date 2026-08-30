import { useEffect, useRef } from 'react'
import { createChart, LineSeries, createSeriesMarkers } from 'lightweight-charts'

const THRESHOLD_HIGH = 70
const THRESHOLD_LOW  = 30

const LAYOUT = {
  background: { type: 'solid', color: '#0d1014' },
  textColor: '#939caa',
  panes: {
    separatorColor: '#232932',
    separatorHoverColor: '#2f3742',
    enableResize: false,
  },
}

export default function Chart({ priceData, rsiData }) {
  const containerRef = useRef(null)
  const initDone     = useRef(false)
  const chartRef     = useRef(null)
  const priceSerRef  = useRef(null)
  const rsiSerRef    = useRef(null)
  const obSerRef     = useRef(null)
  const osSerRef     = useRef(null)
  const markersRef   = useRef(null)
  const priceFitted  = useRef(false)

  // ── Create chart once ───────────────────────────────────────────────────
  useEffect(() => {
    if (initDone.current || !containerRef.current) return
    initDone.current = true

    const el = containerRef.current
    const chart = createChart(el, {
      autoSize: true,
      layout: LAYOUT,
      grid: { vertLines: { color: '#1a1f27' }, horzLines: { color: '#1a1f27' } },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: '#232932' },
      timeScale: {
        borderColor: '#232932',
        timeVisible: true,
        fixLeftEdge: false,
        fixRightEdge: false,
      },
    })
    chartRef.current = chart

    // Pane 0 — price
    priceSerRef.current = chart.addSeries(LineSeries, {
      color: '#3e6fe0', lineWidth: 2,
      priceLineVisible: false, lastValueVisible: true,
      crosshairMarkerVisible: true, crosshairMarkerRadius: 4,
    }, 0)

    // Pane 1 — RSI
    const rsiSer = chart.addSeries(LineSeries, {
      color: '#3e6fe0', lineWidth: 2,
      priceLineVisible: false, lastValueVisible: true,
    }, 1)
    rsiSerRef.current = rsiSer
    markersRef.current = createSeriesMarkers(rsiSer, [])

    obSerRef.current = chart.addSeries(LineSeries, {
      color: 'rgba(22,163,116,0.55)', lineWidth: 1,
      priceLineVisible: false, lastValueVisible: false,
    }, 1)
    osSerRef.current = chart.addSeries(LineSeries, {
      color: 'rgba(216,69,61,0.55)', lineWidth: 1,
      priceLineVisible: false, lastValueVisible: false,
    }, 1)

    try {
      const panes = chart.panes()
      if (panes[0]?.setStretchFactor) panes[0].setStretchFactor(55)
      if (panes[1]?.setStretchFactor) panes[1].setStretchFactor(45)
    } catch {}

    return () => {
      chart.remove()
      initDone.current = false
      priceFitted.current = false
      markersRef.current = null
    }
  }, [])

  // ── Price line update ───────────────────────────────────────────────────
  useEffect(() => {
    if (!priceSerRef.current) return
    try {
      if (priceData.length === 0) {
        priceSerRef.current.setData([])
        priceFitted.current = false
        return
      }
      priceSerRef.current.setData(priceData)
      chartRef.current?.priceScale('right').applyOptions({ autoScale: true })
      if (!priceFitted.current) {
        chartRef.current?.timeScale().fitContent()
        priceFitted.current = true
      }
    } catch (e) { console.warn('price update:', e.message) }
  }, [priceData])

  // ── RSI line + markers ──────────────────────────────────────────────────
  useEffect(() => {
    if (!rsiSerRef.current) return
    try {
      if (rsiData.length === 0) {
        rsiSerRef.current.setData([])
        obSerRef.current?.setData([])
        osSerRef.current?.setData([])
        markersRef.current?.setMarkers([])
        return
      }
      rsiSerRef.current.setData(rsiData)
      const t0 = rsiData[0].time
      const t1 = rsiData.at(-1).time
      obSerRef.current?.setData([{ time: t0, value: THRESHOLD_HIGH }, { time: t1, value: THRESHOLD_HIGH }])
      osSerRef.current?.setData([{ time: t0, value: THRESHOLD_LOW },  { time: t1, value: THRESHOLD_LOW }])

      if (markersRef.current) {
        const markers = rsiData
          .filter(p => p.value >= THRESHOLD_HIGH || p.value <= THRESHOLD_LOW)
          .map(p => ({
            time: p.time,
            position: p.value >= THRESHOLD_HIGH ? 'aboveBar' : 'belowBar',
            color: p.value >= THRESHOLD_HIGH ? '#16a374' : '#d8453d',
            shape: 'circle', size: 1,
          }))
        markersRef.current.setMarkers(markers)
      }
    } catch (e) { console.warn('rsi update:', e.message) }
  }, [rsiData])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
