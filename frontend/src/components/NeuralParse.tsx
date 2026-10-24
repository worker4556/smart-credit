import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

// Визуализация разбора фразы: слова → слои сети → четыре поля. Это иллюстрация того, что происходит
// на сервере (правила, затем языковая модель), а не сама модель: поля заполняет ответ /intent.
export interface NeuralParseHandle {
  fire: (input: number, color: string) => void;
}

const W = 508;
const H = 124;
const OUT_COLORS = ["#ff5a4e", "#4cd38a", "#7c95ff", "#f5b544"];

interface NodeState { x: number; y: number; glow: number; color: string; latched: boolean }
interface Pulse { layer: number; from: number; to: number; t: number; speed: number; color: string }

const NeuralParse = forwardRef<NeuralParseHandle, { inputs: number }>(function NeuralParse({ inputs }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<{ nodes: NodeState[][]; pulses: Pulse[] } | null>(null);

  useEffect(() => {
    const sizes = [Math.max(3, Math.min(inputs, 12)), 7, 7, 4];
    const xs = [14, 170, 330, 494];
    stateRef.current = {
      nodes: sizes.map((n, layer) => Array.from({ length: n }, (_, i) => ({
        x: xs[layer], y: 10 + (H - 20) * (n === 1 ? 0.5 : i / (n - 1)), glow: 0, color: "#fff", latched: false,
      }))),
      pulses: [],
    };
  }, [inputs]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const g = canvas?.getContext("2d");
    if (!canvas || !g) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = W * ratio;
    canvas.height = H * ratio;
    g.setTransform(ratio, 0, 0, ratio, 0, 0);
    let frame = 0;
    const draw = () => {
      const state = stateRef.current;
      if (!state) return;
      const { nodes } = state;
      g.clearRect(0, 0, W, H);
      g.lineWidth = 0.6;
      g.strokeStyle = "rgba(255,255,255,.07)";
      for (let l = 0; l < 3; l++) for (const a of nodes[l]) for (const b of nodes[l + 1]) {
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      }
      const alive: Pulse[] = [];
      for (const p of state.pulses) {
        p.t += p.speed;
        const a = nodes[p.layer][p.from], b = nodes[p.layer + 1][p.to];
        const t0 = Math.max(0, p.t - 0.3), t1 = Math.min(1, p.t);
        const x0 = a.x + (b.x - a.x) * t0, y0 = a.y + (b.y - a.y) * t0;
        const x1 = a.x + (b.x - a.x) * t1, y1 = a.y + (b.y - a.y) * t1;
        const gradient = g.createLinearGradient(x0, y0, x1, y1);
        gradient.addColorStop(0, "rgba(255,255,255,0)");
        gradient.addColorStop(1, p.color);
        g.strokeStyle = gradient; g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
        g.fillStyle = p.color; g.beginPath(); g.arc(x1, y1, 1.8, 0, 7); g.fill();
        if (p.t < 1) { alive.push(p); continue; }
        b.glow = 1; b.color = p.color;
        if (p.layer + 1 === 3) b.latched = true;
        else spread(state, p.layer + 1, p.to, p.color, alive);
      }
      state.pulses = alive;
      nodes.forEach((layer, l) => layer.forEach((n) => {
        const radius = l === 3 ? 6 : l === 0 ? 3.5 : 4;
        const lit = n.latched ? Math.max(n.glow, 0.75) : n.glow;
        g.shadowBlur = 14 * lit; g.shadowColor = n.color;
        g.fillStyle = lit > 0.05 ? n.color : "rgba(255,255,255,.22)";
        g.globalAlpha = 0.35 + 0.65 * Math.max(lit, 0.1);
        g.beginPath(); g.arc(n.x, n.y, radius, 0, 7); g.fill();
        g.shadowBlur = 0; g.globalAlpha = 1;
        n.glow *= 0.94;
      }));
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, []);

  useImperativeHandle(ref, () => ({
    fire(input, color) {
      const state = stateRef.current;
      if (!state) return;
      const index = input % state.nodes[0].length;
      const node = state.nodes[0][index];
      node.glow = 1; node.color = color;
      spread(state, 0, index, color, state.pulses);
    },
  }), []);

  return <canvas ref={canvasRef} className="nn-canvas" aria-hidden="true" />;
});

function spread(state: { nodes: NodeState[][] }, layer: number, from: number, color: string, into: Pulse[]) {
  if (layer >= 3 || into.length > 160) return;
  const count = state.nodes[layer + 1].length;
  const targets = layer === 2 ? [Math.floor(Math.random() * count)] : [Math.floor(Math.random() * count), Math.floor(Math.random() * count)];
  for (const to of targets) {
    into.push({ layer, from, to, t: 0, speed: 0.028 + Math.random() * 0.02, color: layer === 2 ? OUT_COLORS[to] : color });
  }
}

export default NeuralParse;
