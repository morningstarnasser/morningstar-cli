import { terminalReport } from "../runtime/composer-layout.js";
import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { AuthOption, AuthOptionState, AuthState, AuthVendorGroup } from "../auth.js";
import { authStateBadge } from "../auth.js";
import { useTerminalColumns } from "../hooks/useTerminalColumns.js";
import { useTheme } from "../hooks/useTheme.js";
import { fitText, getTerminalDensity } from "../tui-layout.js";

export interface LoginPickerProps {
  groups: AuthVendorGroup[];
  /** Provider currently backing the session, marked as active. */
  activeProvider?: string;
  onSelect: (state: AuthOptionState) => void;
  onCancel: () => void;
  isActive?: boolean;
}

/** Filter vendors by a free-text query; matches vendor name and option labels. */
export function filterAuthGroups(
  groups: readonly AuthVendorGroup[],
  query: string,
): AuthVendorGroup[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [...groups];
  return groups.filter((group) =>
    group.vendor.toLowerCase().includes(normalized)
    || group.options.some((option) =>
      option.option.label.toLowerCase().includes(normalized)
      || option.option.provider.toLowerCase().includes(normalized)));
}

/** Worst-case-free summary for a vendor row: ready wins over anything else. */
export function vendorSummary(group: AuthVendorGroup): string {
  const ready = group.options.filter((option) => option.state === "ready");
  if (ready.length > 0) {
    const kinds = ready.map((option) =>
      option.option.kind === "subscription"
        ? "Abo"
        : option.option.kind === "local"
          ? "lokal"
          : "Key");
    return [...new Set(kinds)].join(" + ");
  }
  return authStateBadge(group.options[0]?.state ?? "key-missing");
}

function stateColor(
  state: AuthState,
  colors: { success: string; warning: string; dim: string },
): string | undefined {
  if (state === "ready") return colors.success;
  if (state === "cli-missing") return colors.dim;
  return colors.warning;
}

export function LoginPicker({
  groups,
  activeProvider,
  onSelect,
  onCancel,
  isActive = true,
}: LoginPickerProps) {
  const { primary, accent, dim, warning, success } = useTheme();
  const columns = useTerminalColumns();
  const density = getTerminalDensity(columns);
  const visibleCount = density === "compact" ? 6 : density === "comfortable" ? 8 : 10;

  const [selectedVendor, setSelectedVendor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);

  const vendorGroups = selectedVendor ? groups : filterAuthGroups(groups, query);
  const activeGroup = selectedVendor
    ? groups.find((group) => group.vendor === selectedVendor)
    : undefined;
  const methods = activeGroup?.options ?? [];
  const itemCount = selectedVendor ? methods.length : vendorGroups.length;
  const selectedIndex = Math.min(selected, Math.max(0, itemCount - 1));
  const start = Math.min(
    Math.max(0, selectedIndex - Math.floor(visibleCount / 2)),
    Math.max(0, itemCount - visibleCount),
  );
  const visibleVendors = selectedVendor ? [] : vendorGroups.slice(start, start + visibleCount);
  const visibleMethods = selectedVendor ? methods.slice(start, start + visibleCount) : [];
  const rowWidth = Math.max(26, columns - 8);

  const returnToVendors = () => {
    setSelectedVendor(null);
    setQuery("");
    setSelected(0);
  };

  useInput((input, key) => {
    if (terminalReport(input)) return;
    if (key.escape) {
      if (selectedVendor) returnToVendors();
      else onCancel();
      return;
    }
    if (key.leftArrow && selectedVendor) {
      returnToVendors();
      return;
    }
    if (key.upArrow) {
      setSelected((value) => Math.max(0, value - 1));
      return;
    }
    if (key.downArrow || key.tab) {
      setSelected((value) => Math.min(Math.max(0, itemCount - 1), value + 1));
      return;
    }
    if (key.return || (key.rightArrow && !selectedVendor)) {
      if (selectedVendor) {
        const method = methods[selectedIndex];
        if (method) onSelect(method);
      } else {
        const group = vendorGroups[selectedIndex];
        if (group) {
          setSelectedVendor(group.vendor);
          setQuery("");
          setSelected(0);
        }
      }
      return;
    }
    if (key.backspace || key.delete) {
      if (query.length > 0) {
        setQuery((value) => value.slice(0, -1));
        setSelected(0);
      } else if (selectedVendor) {
        returnToVendors();
      }
      return;
    }
    if (input && !key.ctrl && !key.meta) {
      setQuery((value) => value + input);
      setSelected(0);
    }
  }, { isActive });

  return (
    <Box
      borderStyle="round"
      borderColor={primary}
      flexDirection="column"
      paddingX={1}
      marginX={1}
      marginY={1}
    >
      <Text>
        <Text color={primary} bold>Anmelden</Text>
        <Text color={dim}>
          {"  ·  "}
          {selectedVendor && activeGroup
            ? `Anbieter › ${activeGroup.vendor}`
            : `${groups.length} Anbieter · Abo (OAuth) oder API-Key`}
        </Text>
      </Text>
      {selectedVendor ? null : (
        <Text>
          <Text color={dim}>Suche  </Text>
          <Text color={accent}>{query || "Anbieter filtern"}</Text>
          {query ? <Text color={primary}>█</Text> : null}
        </Text>
      )}

      <Box flexDirection="column" marginTop={1}>
        {!selectedVendor && visibleVendors.length === 0 ? (
          <Text color={warning}>Kein Anbieter für „{query}“.</Text>
        ) : null}

        {!selectedVendor ? visibleVendors.map((group, visibleIndex) => {
          const absoluteIndex = start + visibleIndex;
          const isSelected = absoluteIndex === selectedIndex;
          const isCurrent = group.options.some(
            (option) => option.option.provider === activeProvider);
          const suffix = `${vendorSummary(group)}${isCurrent ? " · aktiv" : ""}  ›`;
          const labelWidth = Math.max(10, rowWidth - suffix.length - 3);
          const row = `${isSelected ? "›" : " "} ${fitText(group.vendor, labelWidth)}  ${suffix}`;
          return (
            <Text key={group.vendor} inverse={isSelected}>
              <Text
                color={isSelected
                  ? undefined
                  : group.ready
                    ? (isCurrent ? success : undefined)
                    : warning}
              >
                {fitText(row, rowWidth)}
              </Text>
            </Text>
          );
        }) : null}

        {selectedVendor ? visibleMethods.map((method, visibleIndex) => {
          const absoluteIndex = start + visibleIndex;
          const isSelected = absoluteIndex === selectedIndex;
          const isCurrent = method.option.provider === activeProvider;
          const badge = method.state === "ready" && isCurrent
            ? "aktiv"
            : authStateBadge(method.state);
          const suffix = `  ${badge}`;
          const labelWidth = Math.max(12, rowWidth - suffix.length - 3);
          const row = `${isSelected ? "›" : " "} ${fitText(method.option.label, labelWidth)}${suffix}`;
          return (
            <Text key={method.option.id} inverse={isSelected}>
              <Text
                color={isSelected
                  ? undefined
                  : stateColor(method.state, { success, warning, dim })}
              >
                {fitText(row, rowWidth)}
              </Text>
            </Text>
          );
        }) : null}

        {selectedVendor && visibleMethods[selectedIndex - start] ? (
          <Text color={dim}>
            {fitText(`   ${visibleMethods[selectedIndex - start].detail}`, rowWidth)}
          </Text>
        ) : null}
      </Box>

      <Text color={dim}>
        {itemCount > 0 ? `${selectedIndex + 1}/${itemCount}` : "0/0"}
        {selectedVendor
          ? "  ·  ↑↓ Methode · Enter wählen · ←/Esc zurück"
          : "  ·  ↑↓ Anbieter · Enter/→ öffnen · Esc schließen"}
      </Text>
    </Box>
  );
}
