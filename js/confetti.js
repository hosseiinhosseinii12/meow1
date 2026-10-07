/**
 * confetti.js — Physics-based gold and ivory confetti on a full-screen canvas.
 * Particles fall gently with drag, gravity, flutter and rotation for ~3 seconds.
 */
import { reducedMotion } from './state.js';

export function confetti({ duration = 3000, count = 180 } = {}) {
  if (reducedMotion()) return;
  const canvas = document.getElementById('confetti') ?? document.body.appendChild(Object.assign(document.createElement('canvas'), { id: 'confetti' }));
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(2, devicePixelRatio || 1);
  const resize = () => { canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
  resize(); addEventListener('resize', resize);
  const colors = ['#B8935A', '#D8B983', '#E8D5B0', '#FBF9F5', '#F5F1EA', '#9C7A45'];
  const parts = Array.from({ length: count }, () => ({
    x: Math.random() * innerWidth, y: -20 - Math.random() * innerHeight * 0.5,
    vx: (Math.random() - 0.5) * 2, vy: Math.random() * 1.5 + 0.8,
    w: 6 + Math.random() * 6, h: 3 + Math.random() * 5, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.12,
    flutter: Math.random() * Math.PI * 2, c: colors[(Math.random() * colors.length) | 0],
  }));
  const start = performance.now();
  const frame = (now) => {
    const t = now - start;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    const fade = t > duration ? Math.max(0, 1 - (t - duration) / 900) : 1;
    parts.forEach((p) => {
      p.vy = Math.min(p.vy + 0.035, 3.2); // gravity with terminal velocity
      p.vx *= 0.99; // air drag
      p.flutter += 0.08;
      p.x += p.vx + Math.sin(p.flutter) * 0.8; p.y += p.vy; p.r += p.vr;
      ctx.save(); ctx.globalAlpha = fade; ctx.translate(p.x, p.y); ctx.rotate(p.r);
      ctx.scale(1, Math.abs(Math.cos(p.flutter))); // paper-like tumble
      ctx.fillStyle = p.c; ctx.strokeStyle = 'rgba(184,147,90,0.35)'; ctx.lineWidth = 0.5;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.strokeRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });
    if (fade > 0) requestAnimationFrame(frame); else { ctx.clearRect(0, 0, innerWidth, innerHeight); removeEventListener('resize', resize); }
  };
  requestAnimationFrame(frame);
}
