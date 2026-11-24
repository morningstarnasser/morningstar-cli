import { terminalReport } from "../runtime/composer-layout.js";
import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import { createHash } from "node:crypto";
import { useTheme } from "../hooks/useTheme.js";
import type { Risk } from "../policy-engine.js";
import { escapeApprovalDisplay } from "../approval-display.js";

export interface ApprovalPromptProps {
  tool: string;
  target: string;
  reason: string;
  risk: Risk;
  onDecision: (approved: boolean) => void;
  isActive?: boolean;
}

const APPROVAL_PAGE_SIZE = 1_600;

export function paginateApprovalTarget(
  target: string,
  pageSize = APPROVAL_PAGE_SIZE,
): string[] {
  const normalized = target || "(keine Argumente)";
  const pages: string[] = [];
  for (let offset = 0; offset < normalized.length; offset += pageSize) {
    pages.push(normalized.slice(offset, offset + pageSize));
  }
  return pages.length > 0 ? pages : ["(keine Argumente)"];
}

export function ApprovalPrompt({
  tool,
  target,
  reason,
  risk,
  onDecision,
  isActive = true,
}: ApprovalPromptProps) {
  const { primary, accent, dim, warning, error } = useTheme();
  const [selected, setSelected] = useState<0 | 1>(1);
  const [page, setPage] = useState(0);
  const displayTarget = useMemo(() => escapeApprovalDisplay(target), [target]);
  const pages = useMemo(
    () => paginateApprovalTarget(displayTarget),
    [displayTarget],
  );
  const targetHash = useMemo(
    () => createHash("sha256").update(target).digest("hex").slice(0, 16),
    [target],
  );

  useEffect(() => {
    setSelected(1);
    setPage(0);
  }, [tool, target, reason, risk]);

  useInput((input, key) => {
    if (terminalReport(input)) return;
    if (input === "[" && pages.length > 1) {
      setPage((current) => Math.max(0, current - 1));
      return;
    }
    if (input === "]" && pages.length > 1) {
      setPage((current) => Math.min(pages.length - 1, current + 1));
      return;
    }
    if (key.upArrow || key.leftArrow || key.tab) {
      setSelected(0);
      return;
    }
    if (key.downArrow || key.rightArrow) {
      setSelected(1);
      return;
    }
    if (input === "1" || input.toLowerCase() === "y") {
      onDecision(true);
      return;
    }
    if (input === "2" || input.toLowerCase() === "n" || key.escape) {
      onDecision(false);
      return;
    }
    if (key.return) onDecision(selected === 0);
  }, { isActive });

  const riskColor = risk === "high" ? error : warning;

  return (
    <Box
      borderStyle="round"
      borderColor={riskColor}
      flexDirection="column"
      paddingX={1}
      marginX={1}
      marginY={1}
    >
      <Text>
        <Text color={riskColor} bold>Freigabe erforderlich</Text>
        <Text color={dim}>  ·  {risk} risk</Text>
      </Text>
      <Text>
        <Text color={dim}>risk    </Text>
        <Text color={riskColor}>{risk.toUpperCase()}</Text>
      </Text>
      <Text>
        <Text color={dim}>reason  </Text>
        <Text color={warning}>{reason}</Text>
      </Text>
      <Text>
        <Text color={dim}>tool    </Text>
        <Text color={primary}>{tool}</Text>
      </Text>
      <Text>
        <Text color={dim}>args    </Text>
        <Text color={dim}>
          Seite {page + 1}/{pages.length} · {Buffer.byteLength(target)} Bytes · sha256:{targetHash}
        </Text>
      </Text>
      <Text>{pages[page]}</Text>
      {pages.length > 1 ? (
        <Text color={dim}>[ vorherige Seite · ] nächste Seite</Text>
      ) : null}
      <Box marginTop={1} flexDirection="column">
        <Text inverse={selected === 0}>
          <Text color={selected === 0 ? undefined : accent}> 1  Einmal erlauben </Text>
        </Text>
        <Text inverse={selected === 1}>
          <Text color={selected === 1 ? undefined : dim}> 2  Verweigern </Text>
        </Text>
      </Box>
      <Text color={dim}>Enter bestätigt · Esc verweigert</Text>
    </Box>
  );
}
