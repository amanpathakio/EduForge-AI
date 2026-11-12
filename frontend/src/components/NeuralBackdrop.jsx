import React, { useEffect, useRef } from 'react';

/**
 * Interactive 60fps canvas particle constellation representing semantic vector embeddings,
 * paired with smooth pointer spotlight tracking via parent CSS variables (--mx, --my).
 */
export default function NeuralBackdrop({ theme = 'dark' }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    let animId = 0;
    let width = window.innerWidth;
    let height = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const mouse = { x: width * 0.5, y: height * 0.35, active: false };

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();

    const nodeCount = width < 700 ? 22 : 40;
    const nodes = Array.from({ length: nodeCount }, (_, idx) => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.36,
      vy: (Math.random() - 0.5) * 0.36,
      radius: idx % 5 === 0 ? 2.2 : 1.4,
      accent: idx % 3 === 0 ? 'teal' : idx % 2 === 0 ? 'cyan' : 'indigo',
    }));

    const onPointerMove = (e) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      mouse.active = true;
    };

    const onPointerLeave = () => {
      mouse.active = false;
    };

    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerleave', onPointerLeave);

    const isDark = theme === 'dark';

    const drawFrame = () => {
      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < nodes.length; i += 1) {
        const n = nodes[i];
        if (!reducedMotion) {
          n.x += n.vx;
          n.y += n.vy;

          if (n.x < -20) n.x = width + 20;
          if (n.x > width + 20) n.x = -20;
          if (n.y < -20) n.y = height + 20;
          if (n.y > height + 20) n.y = -20;

          if (mouse.active) {
            const dx = mouse.x - n.x;
            const dy = mouse.y - n.y;
            const dist = Math.hypot(dx, dy);
            if (dist < 170 && dist > 1) {
              n.x += (dx / dist) * 0.25;
              n.y += (dy / dist) * 0.25;
            }
          }
        }

        // Vector connection edges
        for (let j = i + 1; j < nodes.length; j += 1) {
          const m = nodes[j];
          const dx = n.x - m.x;
          const dy = n.y - m.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 135) {
            const alpha = (1 - dist / 135) * (isDark ? 0.22 : 0.14);
            ctx.strokeStyle = isDark
              ? `rgba(129, 140, 248, ${alpha.toFixed(3)})`
              : `rgba(79, 70, 229, ${alpha.toFixed(3)})`;
            ctx.lineWidth = 0.9;
            ctx.beginPath();
            ctx.moveTo(n.x, n.y);
            ctx.lineTo(m.x, m.y);
            ctx.stroke();
          }
        }

        // Mouse magnetic lines
        if (mouse.active) {
          const mdx = mouse.x - n.x;
          const mdy = mouse.y - n.y;
          const mdist = Math.hypot(mdx, mdy);
          if (mdist < 185) {
            const alpha = (1 - mdist / 185) * (isDark ? 0.42 : 0.28);
            ctx.strokeStyle = isDark
              ? `rgba(56, 189, 248, ${alpha.toFixed(3)})`
              : `rgba(37, 99, 235, ${alpha.toFixed(3)})`;
            ctx.lineWidth = 1.05;
            ctx.beginPath();
            ctx.moveTo(n.x, n.y);
            ctx.lineTo(mouse.x, mouse.y);
            ctx.stroke();
          }
        }

        // Draw node dot
        const fill =
          n.accent === 'teal'
            ? isDark
              ? 'rgba(52, 211, 153, 0.72)'
              : 'rgba(5, 150, 105, 0.52)'
            : n.accent === 'cyan'
              ? isDark
                ? 'rgba(56, 189, 248, 0.72)'
                : 'rgba(37, 99, 235, 0.5)'
              : isDark
                ? 'rgba(129, 140, 248, 0.72)'
                : 'rgba(79, 70, 229, 0.5)';

        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      if (!reducedMotion) {
        animId = window.requestAnimationFrame(drawFrame);
      }
    };

    drawFrame();

    return () => {
      window.cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerleave', onPointerLeave);
    };
  }, [theme]);

  return (
    <canvas
      ref={canvasRef}
      className="neural-constellation-canvas"
      aria-hidden="true"
    />
  );
}
