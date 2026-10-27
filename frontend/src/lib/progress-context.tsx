"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Progress, progressApi } from "./api";
import { useAuth } from "./auth-context";

interface Celebration {
  id: number;
  title: string;
  subtitle: string;
}

interface ProgressContextValue {
  progress: Progress | null;
  loading: boolean;
  // Refetch progress; returns the fresh value so callers can diff before/after.
  refresh: () => Promise<Progress | null>;
  // Show a toast + confetti burst (level-ups, new badges).
  celebrate: (title: string, subtitle: string) => void;
}

const ProgressContext = createContext<ProgressContextValue | undefined>(undefined);

export function ProgressProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const [progress, setProgress] = useState<Progress | null>(null);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<Celebration[]>([]);
  const [burst, setBurst] = useState(0); // bumping this re-fires confetti
  const idRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!token) return null;
    try {
      const p = await progressApi.get(token);
      setProgress(p);
      return p;
    } catch {
      return null;
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) refresh();
  }, [token, refresh]);

  const celebrate = useCallback((title: string, subtitle: string) => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, title, subtitle }]);
    setBurst((b) => b + 1);
    // Auto-dismiss after a few seconds.
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  return (
    <ProgressContext.Provider value={{ progress, loading, refresh, celebrate }}>
      {children}
      <Confetti trigger={burst} />
      <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex min-w-56 flex-col rounded-card border border-border bg-surface px-4 py-3 shadow-lg"
          >
            <span className="text-sm font-semibold text-primary">{t.title}</span>
            <span className="text-xs text-text-muted">{t.subtitle}</span>
          </div>
        ))}
      </div>
    </ProgressContext.Provider>
  );
}

export function useProgress() {
  const ctx = useContext(ProgressContext);
  if (!ctx) throw new Error("useProgress must be used within ProgressProvider");
  return ctx;
}

// Minimal dependency-free confetti: on each trigger change, spawn particles on
// a fixed full-screen canvas and animate them falling, then clear. Kept small
// and self-contained (no external library).
function Confetti({ trigger }: { trigger: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (trigger === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ["#3454D1", "#0E9E7E", "#D98324", "#6B52E0", "#DC2626"];
    const particles = Array.from({ length: 120 }, () => ({
      x: canvas.width / 2 + (Math.random() - 0.5) * 200,
      y: canvas.height / 3,
      vx: (Math.random() - 0.5) * 8,
      vy: Math.random() * -8 - 3,
      size: Math.random() * 6 + 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
    }));

    let frame = 0;
    let raf = 0;
    const gravity = 0.25;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        p.vy += gravity;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      }
      frame++;
      if (frame < 110) {
        raf = requestAnimationFrame(draw);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [trigger]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-40"
      aria-hidden
    />
  );
}
