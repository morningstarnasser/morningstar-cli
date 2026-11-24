import React, { useEffect, useState, useMemo } from "react";
import { STARTUP_FRAMES, STARTUP_FRAME_MS } from "../runtime/motion.js";
import { Box, Text } from "ink";
import { useTheme } from "../hooks/useTheme.js";
import { useTerminalColumns } from "../hooks/useTerminalColumns.js";
import type { CLIConfig, ProjectContext } from "../types.js";
import { getModelDisplayName, detectProvider } from "../providers.js";
import { getPermissionMode } from "../permissions.js";
import { projectSettingsExist } from "../settings.js";
import { getAllAgents } from "../custom-agents.js";
import { fitText, getProviderLocation, getTerminalDensity } from "../tui-layout.js";

interface BannerProps {
  config: CLIConfig;
  ctx: ProjectContext;
  skipPermissions: boolean;
  frame?: number;
}

export function Banner({ config, ctx, skipPermissions, frame = STARTUP_FRAMES }: BannerProps) {
  const { primary, accent, info, dim, success, warning, star } = useTheme();
  const columns = useTerminalColumns();
  const density = getTerminalDensity(columns);
  const provider = config.provider || detectProvider(config.model);
  const location = getProviderLocation(provider);
  const modelName = fitText(
    getModelDisplayName(config.model),
    density === "compact" ? 27 : density === "comfortable" ? 42 : 60,
  );
  const permissionMode = config.yolo ? "YOLO · auto" : skipPermissions
    ? "bypassPermissions"
    : config.permissionMode || getPermissionMode();
  const settingsActive = useMemo(() => projectSettingsExist(ctx.cwd), [ctx.cwd]);
  const agentCount = useMemo(() => Object.keys(getAllAgents()).length, []);
  const project = fitText(ctx.projectName, density === "compact" ? 24 : 38);
  const language = ctx.language
    ? `${ctx.language}${ctx.framework ? ` / ${ctx.framework}` : ""}`
    : null;
  const locationColor = location === "local" ? success : location === "subscription" ? accent : info;

  const width = Math.max(20, columns - 4);
  const art = ["       ╷       ", "    ╲  │  ╱    ", "  ─── ◇✦◇ ───  ", "    ╱  │  ╲    ", "       ╵       "];
  const glow = [dim, dim, "#966f49", "#c98b52", primary, "#ffe7bc", primary];
  const shimmer = frame < STARTUP_FRAMES ? glow[Math.min(glow.length - 1, Math.floor(frame / 2))] : primary;
  return (
    <Box flexDirection="column" marginY={1} marginLeft={2} width={width}>
      <Box>
        {density !== "compact" ? <Box flexDirection="column" width={19} flexShrink={0}>
          {art.map((line, i) => <Text key={i} color={i === 2 ? shimmer : frame >= i + 2 ? primary : dim}>{line}</Text>)}
        </Box> : null}
        <Box flexDirection="column" flexGrow={1}>
          <Text color={dim}>{density === "compact" ? "✦  YOUR TERMINAL. YOUR TEAM." : "YOUR TERMINAL. YOUR TEAM."}</Text>
          <Text color={shimmer} bold>{density === "compact" ? "M O R N I N G S T A R" : "M O R N I N G S T A R"}</Text>
          <Text color={dim}> </Text>
          <Text><Text color={accent}>{fitText(project, Math.max(12, width - 22))}</Text>{ctx.gitBranch && density !== "compact" ? <Text color={dim}>  ⎇ {fitText(ctx.gitBranch, 22)}</Text> : null}</Text>
          <Text color={dim}>{fitText(`${modelName} · ${location}`, Math.max(18, width - (density === "compact" ? 0 : 19)))}</Text>
        </Box>
      </Box>
      <Text color={dim}>{"─".repeat(width)}</Text>
      <Text><Text color={accent}>◈ </Text><Text color={primary}>{agentCount} agents</Text><Text color={dim}>  /  </Text><Text color={skipPermissions ? warning : accent}>{fitText(permissionMode, 22)}</Text>{density === "wide" ? <Text color={dim}>  /  {settingsActive ? "project settings" : "global settings"}{language ? `  /  ${language}` : ""}</Text> : null}</Text>
      <Text color={dim}><Text color={accent}>/swarm</Text> Team starten   <Text color={accent}>/skills</Text> Wissen   <Text color={accent}>/help</Text> Hilfe</Text>
    </Box>
  );
}

/** Local state only: startup frames never rerender the app or delay input. */
export function StartupBanner({ onDone, ...props }: BannerProps & { onDone: () => void }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    let next = 0;
    const timer = setInterval(() => {
      next++;
      if (next >= STARTUP_FRAMES) { clearInterval(timer); onDone(); }
      else setFrame(next);
    }, STARTUP_FRAME_MS);
    return () => clearInterval(timer);
  }, [onDone]);
  return <Banner {...props} frame={frame} />;
}
