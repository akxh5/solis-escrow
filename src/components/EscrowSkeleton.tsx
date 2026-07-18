"use client";

/**
 * src/components/EscrowSkeleton.tsx
 *
 * Neo-Brutalist loading skeleton cards for the Escrow Explorer feed.
 * Shown while on-chain / API data is being fetched.
 */

export function EscrowCardSkeleton() {
  return (
    <div
      className="brutal-card"
      style={{ padding: 0, overflow: "hidden" }}
      aria-busy="true"
      aria-label="Loading escrow…"
    >
      {/* Color bar */}
      <div className="skeleton-brutal" style={{ height: 8 }} />

      <div style={{ padding: "20px" }}>
        {/* Tags row */}
        <div className="flex items-center gap-2 mb-4">
          <div className="skeleton-brutal" style={{ width: 70, height: 22, border: "2px solid rgba(10,10,10,0.08)" }} />
          <div className="skeleton-brutal" style={{ width: 55, height: 22, border: "2px solid rgba(10,10,10,0.08)" }} />
        </div>

        {/* Title */}
        <div className="skeleton-brutal mb-2" style={{ width: "80%", height: 24, borderRadius: 0 }} />
        <div className="skeleton-brutal mb-4" style={{ width: "55%", height: 18, borderRadius: 0 }} />

        {/* Description */}
        <div className="skeleton-brutal mb-1" style={{ width: "100%", height: 14, borderRadius: 0 }} />
        <div className="skeleton-brutal mb-4" style={{ width: "75%", height: 14, borderRadius: 0 }} />

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ border: "2px solid rgba(10,10,10,0.08)", padding: "10px" }}>
              <div className="skeleton-brutal mb-1" style={{ width: "60%", height: 20, borderRadius: 0 }} />
              <div className="skeleton-brutal" style={{ width: "80%", height: 12, borderRadius: 0 }} />
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div className="skeleton-brutal mb-4" style={{ width: "100%", height: 14, border: "2px solid rgba(10,10,10,0.08)" }} />

        {/* CTA button */}
        <div className="skeleton-brutal" style={{ width: "100%", height: 44, borderRadius: 0 }} />
      </div>
    </div>
  );
}

export function EscrowFeedSkeleton() {
  return (
    <>
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <EscrowCardSkeleton key={i} />
      ))}
    </>
  );
}
