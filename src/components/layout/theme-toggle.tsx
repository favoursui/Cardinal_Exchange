"use client";

import { useRef, useSyncExternalStore, type MouseEvent } from "react";
import { flushSync } from "react-dom";

const key = "cadinal:theme";
function subscribe(notify: () => void) {
  const storage = (event: StorageEvent) => {
    if (event.key !== key && event.key !== null) return;
    document.documentElement.dataset.theme = event.newValue === "light" ? "light" : "dark";
    notify();
  };
  window.addEventListener("cadinal:theme", notify);
  window.addEventListener("storage", storage);
  return () => {
    window.removeEventListener("cadinal:theme", notify);
    window.removeEventListener("storage", storage);
  };
}
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, () => document.documentElement.dataset.theme === "light" ? "light" : "dark", () => "dark");
  const transitioning = useRef(false);
  const label = `Switch to ${theme === "dark" ? "light" : "dark"} mode`;
  const toggle = (event: MouseEvent<HTMLButtonElement>) => {
    if (transitioning.current) return;
    const root = document.documentElement;
    const next = root.dataset.theme === "light" ? "dark" : "light";
    const apply = () => {
      root.dataset.theme = next;
      try { localStorage.setItem(key, next); } catch { /* Storage is optional. */ }
      window.dispatchEvent(new Event("cadinal:theme"));
    };
    if (!document.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      apply();
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    root.style.setProperty("--theme-reveal-x", `${x}px`);
    root.style.setProperty("--theme-reveal-y", `${y}px`);
    root.style.setProperty("--theme-reveal-radius", `${radius}px`);
    root.classList.add("theme-revealing");
    transitioning.current = true;
    const cleanup = () => {
      root.classList.remove("theme-revealing");
      for (const property of ["--theme-reveal-x", "--theme-reveal-y", "--theme-reveal-radius"]) root.style.removeProperty(property);
      transitioning.current = false;
    };
    try {
      const transition = document.startViewTransition(() => flushSync(apply));
      void transition.ready.catch(() => { /* Hidden tabs may skip the animation. */ });
      void transition.finished.catch(() => { if (root.dataset.theme !== next) apply(); }).finally(cleanup);
    } catch {
      apply();
      cleanup();
    }
  };
  return <button type="button" className="settings-button theme-toggle" onClick={toggle} aria-label={label} title={label}>
    <svg aria-hidden="true" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {theme === "dark" ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></> : <path d="M20.8 13.2A9 9 0 0 1 10.8 3.2a9 9 0 1 0 10 10Z" />}
    </svg>
  </button>;
}
