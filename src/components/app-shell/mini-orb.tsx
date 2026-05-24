"use client";

import { useEffect, useRef } from "react";

type Props = {
  size: number;
  className?: string;
};

const PALETTE = ["#d9fb60", "#db2777", "#d9fb60", "#f5f0e8"];
const TILT = 0.23;

export function MiniOrb({ size, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * ratio;
    canvas.height = size * ratio;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);

    let rafId = 0;
    let amp = 0.35;
    const ringCount = size < 32 ? 7 : size < 56 ? 10 : 13;
    const N = size < 32 ? 22 : size < 56 ? 32 : 48;
    const cx = size / 2;
    const cy = size / 2;
    const R = size * 0.4;
    const cosT = Math.cos(TILT);
    const sinT = Math.sin(TILT);

    type Seg = {
      ax: number;
      ay: number;
      bx: number;
      by: number;
      midZ: number;
      color: string;
    };

    const draw = (t: number) => {
      const base = 0.38 + 0.42 * Math.abs(Math.sin(t / 750));
      const noise = (Math.random() - 0.5) * 0.16;
      amp = Math.max(0.1, Math.min(1, amp * 0.88 + (base + noise) * 0.12));

      ctx.clearRect(0, 0, size, size);

      const spin = t / 4200;
      const cosS = Math.cos(spin);
      const sinS = Math.sin(spin);

      const segs: Seg[] = [];

      for (let i = 1; i < ringCount; i++) {
        const phi = (i / ringCount - 0.5) * Math.PI;
        const ringR = Math.cos(phi) * R;
        const ringY = Math.sin(phi) * R;
        const phase = i * 0.65 + t / 850;
        const waveDepth = 0.07 + amp * 0.16;
        const color = PALETTE[i % PALETTE.length];

        let prevX = 0;
        let prevY = 0;
        let prevZ = 0;

        for (let j = 0; j <= N; j++) {
          const psi = (j / N) * Math.PI * 2;
          const r = ringR * (1 + waveDepth * Math.sin(4 * psi + phase));
          const lx = r * Math.cos(psi);
          const lz = r * Math.sin(psi);
          const nx = lx * cosS - lz * sinS;
          const nz = lx * sinS + lz * cosS;
          const fy = ringY * cosT - nz * sinT;
          const fz = ringY * sinT + nz * cosT;
          const x = cx + nx;
          const y = cy + fy;

          if (j > 0) {
            segs.push({
              ax: prevX,
              ay: prevY,
              bx: x,
              by: y,
              midZ: (prevZ + fz) / 2,
              color,
            });
          }
          prevX = x;
          prevY = y;
          prevZ = fz;
        }
      }

      segs.sort((p, q) => p.midZ - q.midZ);

      const baseW = Math.max(0.7, size / 36);
      for (const s of segs) {
        const depth = (s.midZ / R + 1) / 2;
        ctx.beginPath();
        ctx.moveTo(s.ax, s.ay);
        ctx.lineTo(s.bx, s.by);
        ctx.strokeStyle = s.color;
        ctx.globalAlpha = 0.36 + depth * 0.55;
        ctx.lineWidth = baseW * (0.55 + depth * 0.9);
        ctx.lineCap = "round";
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [size]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-hidden
      style={{ display: "block" }}
    />
  );
}
