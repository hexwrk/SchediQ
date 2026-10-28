"use client"; // Error boundaries must be Client Components

// Last-resort boundary for errors in the root layout itself. It replaces the
// whole document, so it renders its own <html>/<body> and inline styles
// (globals.css is not loaded here).
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f7f8fa", color: "#1a1d23" }}>
        <title>SchediQ: something went wrong</title>
        <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div role="alert" style={{ maxWidth: 420, textAlign: "center", background: "#fff", border: "1px solid #e6e8ec", borderRadius: 12, padding: 32 }}>
            <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>SchediQ hit an unexpected error</h1>
            <p style={{ color: "#6b7280", fontSize: 14, margin: "0 0 16px" }}>
              Your data is safe. Reload the app to continue.
            </p>
            {error.digest && <p style={{ color: "#6b7280", fontSize: 12 }}>Reference: {error.digest}</p>}
            <button
              onClick={() => retry()}
              style={{ background: "#3454d1", color: "#fff", border: 0, borderRadius: 8, padding: "10px 18px", fontSize: 14, cursor: "pointer" }}
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
