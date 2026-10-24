// Фон раздела «Помощь»: плавные потоки в фирменных красных тонах. Только декор — aria-hidden, без интерактива.
const flows = [
  { d: "M-80 210 C 220 90, 520 300, 860 170 S 1300 60, 1600 160", w: 110, o: 0.3, dur: 24 },
  { d: "M-80 250 C 260 150, 560 330, 900 220 S 1320 120, 1600 210", w: 3, o: 0.9, dur: 12 },
  { d: "M-80 820 C 260 700, 560 900, 900 780 S 1320 660, 1600 760", w: 120, o: 0.3, dur: 28 },
  { d: "M-80 520 C 180 380, 420 640, 720 470 S 1180 300, 1600 430", w: 140, o: 0.32, dur: 26 },
  { d: "M-80 600 C 220 470, 470 700, 780 560 S 1220 410, 1600 520", w: 80, o: 0.4, dur: 20 },
  { d: "M-80 440 C 260 300, 520 560, 820 400 S 1260 240, 1600 360", w: 3, o: 0.9, dur: 14 },
  { d: "M-80 660 C 240 560, 500 760, 800 640 S 1240 500, 1600 600", w: 3, o: 0.8, dur: 18 },
  { d: "M-80 380 C 300 260, 560 480, 860 340 S 1280 200, 1600 300", w: 2, o: 0.6, dur: 22 },
];

export default function FlowBackground() {
  return (
    <svg className="flow-bg" viewBox="0 0 1520 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="flow-red" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#ef3124" stopOpacity="0" />
          <stop offset=".35" stopColor="#ef3124" />
          <stop offset=".7" stopColor="#ff7a5c" />
          <stop offset="1" stopColor="#ef3124" stopOpacity="0" />
        </linearGradient>
        <filter id="flow-blur"><feGaussianBlur stdDeviation="18" /></filter>
      </defs>
      {flows.map((f, i) => (
        <path
          key={i}
          className={f.w > 10 ? "flow-ribbon" : "flow-line"}
          d={f.d}
          fill="none"
          stroke="url(#flow-red)"
          strokeWidth={f.w}
          strokeLinecap="round"
          opacity={f.o}
          filter={f.w > 10 ? "url(#flow-blur)" : undefined}
          style={{ animationDuration: `${f.dur}s`, animationDelay: `${-i * 3}s` }}
        />
      ))}
    </svg>
  );
}
