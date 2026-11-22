const COLORS = ["#0e6a72", "#17191c", "#f59e0b", "#10b981", "#5fd0c5"];

export function burst() {
  if (typeof document === "undefined" || document.hidden) return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const canvas = document.createElement("canvas");
  const width = (canvas.width = window.innerWidth);
  const height = (canvas.height = window.innerHeight);
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:fixed;inset:0;z-index:10000;pointer-events:none";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  const bits = Array.from({ length: 110 }, (_, i) => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 5 + Math.random() * 9;
    return { x: width / 2, y: height * 0.3, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 5, r: 3 + Math.random() * 4, c: COLORS[i % COLORS.length], s: Math.random() * 6 };
  });
  const start = performance.now();
  const tick = (now) => {
    const t = (now - start) / 1700;
    ctx.clearRect(0, 0, width, height);
    bits.forEach((p) => {
      p.vy += 0.32;
      p.vx *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.s += 0.2;
      ctx.globalAlpha = Math.max(0, 1 - t);
      ctx.fillStyle = p.c;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.s);
      ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
      ctx.restore();
    });
    if (t < 1) requestAnimationFrame(tick);
    else canvas.remove();
  };
  requestAnimationFrame(tick);
}
