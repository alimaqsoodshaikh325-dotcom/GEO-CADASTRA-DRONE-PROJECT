import { useEffect, useRef } from 'react'
export default function ParticleBackground({ dense = false }) {
  const ref = useRef(null)
  useEffect(() => {
    const canvas = ref.current, ctx = canvas.getContext('2d'); let frame; let particles = []; let active = true
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    const setup = () => { const ratio = devicePixelRatio || 1; canvas.width = innerWidth * ratio; canvas.height = innerHeight * ratio; canvas.style.width = `${innerWidth}px`; canvas.style.height = `${innerHeight}px`; ctx.setTransform(ratio, 0, 0, ratio, 0, 0); const count = reduce ? 24 : (innerWidth < 700 ? 38 : dense ? 125 : 78); particles = Array.from({ length: count }, () => ({ x: Math.random()*innerWidth, y: Math.random()*innerHeight, r: Math.random()*1.4+.25, v: Math.random()*.25+.05, hue: Math.random()>.7 ? 276 : 192 })) }
    const tick = () => { if (!active) return; ctx.clearRect(0,0,innerWidth,innerHeight); particles.forEach(p => { p.y -= p.v; if (p.y < -4) { p.y = innerHeight+4; p.x = Math.random()*innerWidth }; ctx.beginPath(); ctx.fillStyle = `hsla(${p.hue},100%,75%,.55)`; ctx.shadowBlur = 12; ctx.shadowColor = ctx.fillStyle; ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill() }); ctx.shadowBlur=0; if (!reduce) frame = requestAnimationFrame(tick) }
    const visibility = () => { active = !document.hidden; if (active && !reduce) tick() }; setup(); tick(); addEventListener('resize', setup); document.addEventListener('visibilitychange', visibility)
    return () => { cancelAnimationFrame(frame); removeEventListener('resize', setup); document.removeEventListener('visibilitychange', visibility) }
  }, [dense])
  return <canvas ref={ref} className="particle-field" aria-hidden="true" />
}
