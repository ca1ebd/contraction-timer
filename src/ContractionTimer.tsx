import { useState, useEffect, useCallback } from "react";
import { storage } from "./lib/storage";
import { useWakeLock } from "./lib/useWakeLock";

const KEY = "contractions-v1";
const MIN_DUR = 5;
const MIN_GAP_PAD = 5;
const BUILD_ID = import.meta.env.VITE_COMMIT_SHA?.slice(0, 7) || "dev";

type Theme = "dark" | "light";

type Contraction = {
  id: number; // creation timestamp, stable, used as React key
  start: number; // epoch ms, when the contraction began
  dur: number; // seconds, how long it lasted
};

type Edit =
  | { kind: "dot"; idx: number; value: number }
  | { kind: "gap"; idx: number; value: number }
  | null;

type ThemeColors = {
  bg: string;
  backdrop: string;
  surface: string;
  chip: string;
  press: string;
  text: string;
  muted: string;
  faint: string;
  line: string;
  accent: string;
  accentText: string;
  scheme: "dark" | "light";
};

const THEMES: Record<Theme, ThemeColors> = {
  dark: {
    bg: "#12101a",
    backdrop: "#08070d",
    surface: "#241e36",
    chip: "#241e36",
    press: "#3a3059",
    text: "#f6f3fc",
    muted: "#c3bade",
    faint: "#a79dc9",
    line: "#524374",
    accent: "#ff9ab1",
    accentText: "#1a1226",
    scheme: "dark",
  },
  light: {
    bg: "#fdf8f9",
    backdrop: "#e6dee1",
    surface: "#ffffff",
    chip: "#efdee4",
    press: "#f0e6ea",
    text: "#1f172e",
    muted: "#544a6e",
    faint: "#6d6389",
    line: "#d8c8dd",
    accent: "#c53663",
    accentText: "#ffffff",
    scheme: "light",
  },
};

const fmt = (sec: number) => {
  const t = Math.max(0, Math.round(sec));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};
const clock = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export default function ContractionTimer() {
  const [list, setList] = useState<Contraction[]>([]);
  const [runningStart, setRunningStart] = useState<number | null>(null);
  const [theme, setTheme] = useState<Theme>("dark");
  const [now, setNow] = useState(Date.now());
  const [edit, setEdit] = useState<Edit>(null);
  const [loaded, setLoaded] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [copiedBuild, setCopiedBuild] = useState(false);

  const T = THEMES[theme];

  useWakeLock(runningStart != null);

  useEffect(() => {
    // Keeps the browser's own chrome (Safari/Chrome status bar & address bar
    // tinting) in sync with the in-app theme toggle -- this meta tag is
    // static in index.html otherwise, so a browser tab (not installed
    // standalone) would stay locked to whichever theme was current at load.
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", T.bg);
  }, [T.bg]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const r = await storage.get(KEY);
        const d = r ? JSON.parse(r.value) : null;
        if (d) {
          setList(d.list || []);
          setRunningStart(d.runningStart ?? null);
          if (d.theme) setTheme(d.theme);
        }
      } catch {
        /* nothing saved yet */
      }
      setLoaded(true);
    })();
  }, []);

  const persist = useCallback(
    async (list: Contraction[], runningStart: number | null, theme: Theme) => {
      try {
        await storage.set(KEY, JSON.stringify({ list, runningStart, theme }));
      } catch {
        /* keep going with in-memory state */
      }
    },
    []
  );

  const commit = (nextList: Contraction[], nextRunning: number | null = runningStart) => {
    setList(nextList);
    setRunningStart(nextRunning);
    persist(nextList, nextRunning, theme);
  };

  const flipTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    persist(list, runningStart, next);
  };

  // Long-pressing to select a 7-character sha inside a sheet is fiddly on a
  // phone, so the whole line is a copy target. It stays selectable too, for
  // anyone on a desktop who would rather drag across it.
  const copyBuild = async () => {
    try {
      await navigator.clipboard.writeText(BUILD_ID);
      setCopiedBuild(true);
    } catch {
      /* clipboard blocked -- selecting the text still works */
    }
  };

  const closeAbout = () => {
    setShowAbout(false);
    setCopiedBuild(false);
  };

  const toggle = () => {
    if (runningStart == null) {
      commit(list, Date.now());
    } else {
      const dur = Math.max(MIN_DUR, Math.round((Date.now() - runningStart) / 1000));
      commit([...list, { id: runningStart, start: runningStart, dur }], null);
    }
  };

  const addManual = () => {
    const last = list[list.length - 1];
    const start = last
      ? Math.max(last.start + (last.dur + 300) * 1000, Date.now())
      : Date.now();
    const next = [...list, { id: Date.now(), start, dur: 60 }];
    commit(next);
    setEdit({ kind: "dot", idx: next.length - 1, value: 60 });
  };

  const gapOf = (i: number) => Math.round((list[i].start - list[i - 1].start) / 1000);
  const openDot = (i: number) => setEdit({ kind: "dot", idx: i, value: list[i].dur });
  const openGap = (i: number) => setEdit({ kind: "gap", idx: i, value: gapOf(i) });

  const saveEdit = () => {
    if (!edit) return;
    const { kind, idx, value } = edit;
    if (kind === "dot") {
      const max = list[idx + 1] ? gapOf(idx + 1) - MIN_GAP_PAD : Infinity;
      const dur = Math.min(Math.max(MIN_DUR, value), max);
      commit(list.map((c, i) => (i === idx ? { ...c, dur } : c)));
    } else {
      const min = list[idx - 1].dur + MIN_GAP_PAD;
      const gap = Math.max(min, value);
      const delta = (gap - gapOf(idx)) * 1000;
      commit(list.map((c, i) => (i >= idx ? { ...c, start: c.start + delta } : c)));
    }
    setEdit(null);
  };

  const removeAt = (idx: number) => {
    commit(list.filter((_, i) => i !== idx));
    setEdit(null);
  };

  const recent = list.filter((c) => now - c.start < 3600e3);
  const avgDur = recent.length
    ? recent.reduce((a, c) => a + c.dur, 0) / recent.length
    : 0;
  const gaps = recent
    .map((c, i) => (i ? Math.round((c.start - recent[i - 1].start) / 1000) : null))
    .filter((g): g is number => g !== null);
  const avgGap = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;

  const rev = [...list].reverse();
  const live = runningStart != null ? (now - runningStart) / 1000 : 0;
  const dotSize = (d: number) => Math.min(52, Math.max(20, 18 + d * 0.34));
  const lineLen = (g: number) => Math.min(150, Math.max(30, g * 0.32));

  const css = `
    .ct-root { background: ${T.bg}; color: ${T.text}; color-scheme: ${T.scheme}; }
    .ct-root * { color: inherit; }
    .ct-muted { color: ${T.muted} !important; }
    .ct-faint { color: ${T.faint} !important; }
    .ct-accent { color: ${T.accent} !important; }
    .ct-surface { background: ${T.surface}; }
    .ct-chip { background: ${T.chip}; border: 1px solid ${T.line}; }
    .ct-chip:active { background: ${T.press}; }
    .ct-go { background: ${T.accent}; color: ${T.accentText} !important; }
    .ct-dot { background: ${T.accent}; }
    .ct-line { background: ${T.line}; }
    .ct-row:active .ct-line { background: ${T.accent}; }
    .ct-row:active .ct-dot { opacity: 0.6; }
    .ct-border { border-color: ${T.line}; }
    button:focus-visible { outline: 2px solid ${T.accent}; outline-offset: 2px; }
  `;

  if (!loaded) {
    return <div className="h-dvh" style={{ background: T.backdrop }} />;
  }

  return (
    <div
      className="h-dvh flex flex-col md:items-center md:justify-center md:p-8"
      style={{ background: T.backdrop }}
    >
      <style>{css}</style>

      <div className="w-full flex-1 min-h-0 flex md:max-w-[1200px] md:items-center md:justify-center">
        <div
          className="ct-root w-full h-full min-h-0 flex flex-col select-none md:max-w-[560px] md:h-[min(880px,calc(100dvh-4rem))] md:rounded-[28px] md:border md:shadow-2xl md:overflow-hidden"
          style={{
            fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
            paddingTop: "env(safe-area-inset-top)",
            paddingBottom: "env(safe-area-inset-bottom)",
            paddingLeft: "env(safe-area-inset-left)",
            paddingRight: "env(safe-area-inset-right)",
            borderColor: T.line,
          }}
        >
          <div className="shrink-0 px-5 pt-6 pb-4 border-b ct-border">
            <div className="flex items-center justify-between">
              <span className="ct-muted text-[11px] uppercase tracking-[0.2em] font-medium">
                {runningStart != null ? "Contraction" : "Last hour"}
              </span>
              <div className="flex items-center gap-4">
                <button onClick={flipTheme} className="ct-muted text-[11px] py-1" aria-label="Switch theme">
                  {theme === "dark" ? "Light" : "Dark"}
                </button>
                <button onClick={() => setShowAbout(true)} className="ct-muted text-[11px] py-1" aria-label="About">
                  About
                </button>
              </div>
            </div>

            {runningStart != null ? (
              <div className="ct-accent mt-1 text-6xl font-light tabular-nums tracking-tight">
                {fmt(live)}
              </div>
            ) : (
              <div className="mt-1 flex gap-8">
                <div>
                  <div className="text-4xl font-light tabular-nums">{fmt(avgDur)}</div>
                  <div className="ct-muted text-[11px] mt-0.5">avg length</div>
                </div>
                <div>
                  <div className="text-4xl font-light tabular-nums">{fmt(avgGap)}</div>
                  <div className="ct-muted text-[11px] mt-0.5">avg apart</div>
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-6">
            {list.length === 0 ? (
              <p className="ct-muted text-sm leading-relaxed select-text">
                Tap start when a contraction begins, stop when it ends. Tap a contraction dot to
                change its length or tap the line between dots to adjust the time between contractions.
              </p>
            ) : (
              rev.map((c, ri) => {
                const i = list.length - 1 - ri;
                return (
                  <div key={c.id} className="w-full">
                    <button onClick={() => openDot(i)} className="ct-row flex items-center gap-4 w-full text-left">
                      <span className="w-14 flex justify-center shrink-0">
                        <span
                          className="ct-dot rounded-full"
                          style={{ width: dotSize(c.dur), height: dotSize(c.dur) }}
                        />
                      </span>
                      <span className="flex-1 flex items-baseline gap-2">
                        <span className="text-lg tabular-nums">{fmt(c.dur)}</span>
                        <span className="ct-faint text-[11px]">long</span>
                      </span>
                      <span className="ct-faint text-[11px] tabular-nums">{clock(c.start)}</span>
                    </button>

                    {i > 0 && (
                      <button onClick={() => openGap(i)} className="ct-row flex items-stretch gap-4 w-full text-left">
                        <span className="w-14 flex justify-center shrink-0">
                          <span
                            className="ct-line w-[3px] rounded-full"
                            style={{ height: lineLen(gapOf(i)) }}
                          />
                        </span>
                        <span
                          className="ct-muted flex-1 flex items-center text-[13px] tabular-nums"
                          style={{ minHeight: lineLen(gapOf(i)) }}
                        >
                          {fmt(gapOf(i))} apart
                        </span>
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className="shrink-0 px-5 pt-3 pb-5 border-t ct-border">
            <div className="flex justify-between items-center">
              <button onClick={addManual} className="ct-muted text-sm py-2">
                Add missed contraction
              </button>
              {confirmClear ? (
                <span className="flex gap-4">
                  <button
                    onClick={() => {
                      commit([], null);
                      setConfirmClear(false);
                    }}
                    className="ct-accent text-sm py-2 font-medium"
                  >
                    Erase all
                  </button>
                  <button onClick={() => setConfirmClear(false)} className="ct-muted text-sm py-2">
                    Keep
                  </button>
                </span>
              ) : (
                <button onClick={() => setConfirmClear(true)} className="ct-faint text-sm py-2">
                  Clear log
                </button>
              )}
            </div>

            <button
              onClick={toggle}
              className={`mt-3 w-full py-4 rounded-2xl text-base font-semibold ${
                runningStart != null ? "ct-go" : "ct-chip"
              }`}
            >
              {runningStart != null ? "Stop" : "Start contraction"}
            </button>
          </div>
        </div>
      </div>

      {edit && (
        <div
          className="fixed inset-0 flex items-end md:items-center md:justify-center"
          style={{ background: "rgba(0,0,0,0.55)" }}
          onClick={() => setEdit(null)}
        >
          <div
            className="ct-surface w-full rounded-t-3xl p-6 md:max-w-sm md:rounded-3xl"
            style={{ color: T.text, paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ct-muted text-[11px] uppercase tracking-[0.2em] font-medium">
              {edit.kind === "dot" ? "Length of contraction" : "Time between contractions"}
            </div>
            <div className="ct-accent text-5xl font-light tabular-nums mt-2 mb-5">
              {fmt(edit.value)}
            </div>

            <div className="grid grid-cols-4 gap-2">
              {(edit.kind === "dot" ? [-30, -5, 5, 30] : [-60, -15, 15, 60]).map((d) => (
                <button
                  key={d}
                  onClick={() => setEdit((e) => (e ? { ...e, value: Math.max(MIN_DUR, e.value + d) } : e))}
                  className="py-3 rounded-xl tabular-nums text-sm font-medium"
                  style={{ background: T.press }}
                >
                  {d > 0 ? `+${d}` : d}s
                </button>
              ))}
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={saveEdit} className="ct-go flex-1 py-3.5 rounded-xl font-semibold">
                Save
              </button>
              <button
                onClick={() => setEdit(null)}
                className="px-5 py-3.5 rounded-xl font-medium"
                style={{ background: T.press }}
              >
                Cancel
              </button>
            </div>

            {edit.kind === "dot" && (
              <button onClick={() => removeAt(edit.idx)} className="ct-muted w-full mt-3 py-2 text-sm">
                Delete this contraction
              </button>
            )}
          </div>
        </div>
      )}

      {showAbout && (
        <div
          className="fixed inset-0 flex items-end md:items-center md:justify-center"
          style={{ background: "rgba(0,0,0,0.55)" }}
          onClick={closeAbout}
        >
          <div
            className="ct-surface w-full rounded-t-3xl p-6 md:max-w-sm md:rounded-3xl"
            style={{ color: T.text, paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ct-muted text-[11px] uppercase tracking-[0.2em] font-medium">About</div>
            <div className="text-lg font-medium mt-2">Contraction Timer</div>

            <div className="mt-4 flex flex-col gap-1.5">
              <a
                href="https://www.linkedin.com/in/dudleycaleb/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm underline"
              >
                Created by Caleb Dudley
              </a>
              <a
                href="https://github.com/ca1ebd/contraction-timer"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm underline"
              >
                View source on GitHub
              </a>
            </div>

            <button
              onClick={copyBuild}
              className="ct-faint text-sm tabular-nums mt-4 select-text text-left"
            >
              Build {BUILD_ID}
              {copiedBuild ? " · copied" : ""}
            </button>

            <button
              onClick={closeAbout}
              className="mt-6 w-full py-3.5 rounded-xl font-medium"
              style={{ background: T.press }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
