"use client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="center-message">
      <p className="mono">ERROR{error.digest ? ` · ${error.digest}` : ""}</p>
      <h1>页面暂时不可用</h1>
      <button type="button" className="text-btn" onClick={reset}>重试</button>
    </main>
  );
}
