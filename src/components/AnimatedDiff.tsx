import React, { useState, useEffect, useRef } from "react";
import { Box, Text } from "ink";

interface AnimatedDiffProps {
  oldLines: string[];
  newLines: string[];
  onComplete?: () => void;
}

// Red fade shades: bright → medium → dark → hidden
const RED_SHADES = ["#f87171", "#dc2626", "#991b1b"] as const;

export function AnimatedDiff({ oldLines, newLines, onComplete }: AnimatedDiffProps) {
  const [phase, setPhase] = useState<"old" | "fading" | "morphing" | "done">("old");
  const [fadeStep, setFadeStep] = useState(0);
  const [visibleChars, setVisibleChars] = useState(0);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const totalNewChars = newLines.join("").length;

  // Phase 1: Show old lines for 400ms, then start fading
  useEffect(() => {
    if (phase !== "old") return;
    const timer = setTimeout(() => setPhase("fading"), 400);
    return () => clearTimeout(timer);
  }, [phase]);

  // Phase 2: Fade old lines out (3 steps × 100ms)
  useEffect(() => {
    if (phase !== "fading") return;
    if (fadeStep >= 3) {
      setPhase("morphing");
      return;
    }
    const timer = setTimeout(() => setFadeStep(s => s + 1), 100);
    return () => clearTimeout(timer);
  }, [phase, fadeStep]);

  // Phase 3: Typewriter new lines (30ms per char)
  useEffect(() => {
    if (phase !== "morphing") return;
    if (visibleChars >= totalNewChars) {
      setPhase("done");
      return;
    }
    const interval = setInterval(() => {
      setVisibleChars(v => {
        const next = v + 2; // 2 chars at a time for speed
        if (next >= totalNewChars) {
          clearInterval(interval);
          return totalNewChars;
        }
        return next;
      });
    }, 25);
    return () => clearInterval(interval);
  }, [phase, totalNewChars]);

  // Phase 4: Done callback
  useEffect(() => {
    if (phase === "done" && onCompleteRef.current) onCompleteRef.current();
  }, [phase]);

  // --- Render ---

  // Fading old lines
  if (phase === "old" || phase === "fading") {
    if (fadeStep >= 3) return null;
    const color = RED_SHADES[Math.min(fadeStep, 2)];
    return (
      <Box flexDirection="column">
        {oldLines.map((line, i) => (
          <Text key={i} color={color}>{"- "}{line}</Text>
        ))}
      </Box>
    );
  }

  // Typewriter new lines
  if (phase === "morphing") {
    let consumed = 0;
    return (
      <Box flexDirection="column">
        {newLines.map((line, i) => {
          const start = consumed;
          consumed += line.length;
          const vis = Math.max(0, Math.min(line.length, visibleChars - start));
          return (
            <Text key={i}>
              <Text color="#34d399">{"+ "}{line.slice(0, vis)}</Text>
              {vis < line.length && <Text color="#064e3b">{line.slice(vis)}</Text>}
            </Text>
          );
        })}
      </Box>
    );
  }

  // Done — all new lines visible
  return (
    <Box flexDirection="column">
      {newLines.map((line, i) => (
        <Text key={i} color="#34d399">{"+ "}{line}</Text>
      ))}
    </Box>
  );
}
