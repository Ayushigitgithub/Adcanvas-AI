// src/components/FitStage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";

export default function FitStage({ canvasW, canvasH, headerOffset = 220, children }) {
  const hostRef = useRef(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (!hostRef.current) return;

    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;

      // scale to fit INSIDE the panel
      const s = Math.min(width / canvasW, height / canvasH);

      // keep it sane, and never exceed 1 (no zooming beyond 100%)
      setScale(Math.max(0.1, Math.min(s, 1)));
    });

    ro.observe(hostRef.current);
    return () => ro.disconnect();
  }, [canvasW, canvasH]);

  const scaledW = useMemo(() => Math.round(canvasW * scale), [canvasW, scale]);
  const scaledH = useMemo(() => Math.round(canvasH * scale), [canvasH, scale]);

  return (
    <div
      ref={hostRef}
      style={{
        width: "100%",
        height: `calc(100vh - ${headerOffset}px)`,
        minHeight: 520,
        background: "#fff",
        borderRadius: 14,
        border: "1px solid rgba(0,0,0,0.10)",
        overflow: "hidden",
        display: "grid",
        placeItems: "center",
      }}
    >
      {/* This wrapper is the DISPLAY size */}
      <div style={{ width: scaledW, height: scaledH, overflow: "hidden" }}>
        {/* This wrapper keeps "real" canvas size but scales it visually */}
        <div
          style={{
            width: canvasW,
            height: canvasH,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
