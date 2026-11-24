import { terminalReport } from "../runtime/composer-layout.js";
import React, { useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import type { ProviderCatalogEntry } from "../providers.js";
import { getModelDisplayName, listProviders } from "../providers.js";
import { getProviderModelRefreshStatus } from "../provider-model-discovery.js";
import { useTerminalColumns } from "../hooks/useTerminalColumns.js";
import { useTheme } from "../hooks/useTheme.js";
import { fitText, getTerminalDensity } from "../tui-layout.js";

export interface ModelChoice {
  model: string;
  provider: string;
  displayName: string;
  location: "local" | "hosted" | "subscription";
  availabilityHint?: string;
}

export interface ModelProviderGroup {
  provider: string;
  label: string;
  choices: ModelChoice[];
}

export interface ModelPickerProps {
  currentModel: string;
  currentProvider?: string;
  hasCredential: (provider: string) => boolean;
  onSelect: (model: string, provider: string) => void;
  onCancel: () => void;
  isActive?: boolean;
}

function modelLocation(
  provider: string,
  deployment?: "local" | "hosted",
): ModelChoice["location"] {
  if (deployment === "local" || provider === "ollama" || provider === "hydra-local") {
    return "local";
  }
  if (provider === "claude-cli" || provider === "codex-cli") return "subscription";
  return "hosted";
}

/**
 * Flatten the shared provider catalog into contiguous provider groups. The
 * active provider comes first, followed by local, subscription, and hosted
 * providers. The active model remains first inside its provider.
 */
export function buildModelChoices(
  providers: readonly ProviderCatalogEntry[],
  currentModel: string,
  currentProvider?: string,
): ModelChoice[] {
  const choices = providers.flatMap((provider, providerIndex) =>
    provider.models
      .filter((model) => !model.startsWith("("))
      .map((model, modelIndex) => {
        const metadata = provider.modelMetadata?.[model];
        return {
          model,
          provider: provider.name,
          displayName: getModelDisplayName(model),
          location: modelLocation(provider.name, metadata?.deployment),
          availabilityHint: metadata?.availabilityHint,
          providerIndex,
          modelIndex,
        };
      }),
  );

  const resolvedCurrentProvider = currentProvider
    ?? choices.find((choice) => choice.model === currentModel)?.provider;
  const providerPriority = (choice: typeof choices[number]): number => {
    if (choice.provider === resolvedCurrentProvider) return 0;
    if (choice.location === "local") return 1;
    if (choice.location === "subscription") return 2;
    return 3;
  };

  return choices
    .sort((left, right) => {
      return providerPriority(left) - providerPriority(right)
        || left.providerIndex - right.providerIndex
        || Number(
          right.model === currentModel
          && right.provider === resolvedCurrentProvider,
        )
        - Number(
          left.model === currentModel
          && left.provider === resolvedCurrentProvider,
        )
        || left.modelIndex - right.modelIndex;
    })
    .map(({ providerIndex: _providerIndex, modelIndex: _modelIndex, ...choice }) => choice);
}

const PROVIDER_LABELS: Record<string, string> = {
  ollama: "Ollama · lokal",
  "hydra-local": "Hydra · lokal",
  "claude-cli": "Claude CLI · Abo",
  "codex-cli": "Codex CLI · ChatGPT-Abo",
  anthropic: "Anthropic",
  deepseek: "DeepSeek",
  google: "Google",
  nvidia: "NVIDIA NIM",
  "github-models": "GitHub Models",
  openai: "OpenAI",
  groq: "Groq",
  openrouter: "OpenRouter",
};

export function groupModelChoices(
  choices: readonly ModelChoice[],
): ModelProviderGroup[] {
  const groups: ModelProviderGroup[] = [];
  for (const choice of choices) {
    const previous = groups.at(-1);
    if (previous?.provider === choice.provider) {
      previous.choices.push(choice);
      continue;
    }
    groups.push({
      provider: choice.provider,
      label: PROVIDER_LABELS[choice.provider] ?? choice.provider,
      choices: [choice],
    });
  }
  return groups;
}

export function buildModelProviderGroups(
  providers: readonly ProviderCatalogEntry[],
  currentModel: string,
  currentProvider?: string,
): ModelProviderGroup[] {
  const groups = groupModelChoices(
    buildModelChoices(providers, currentModel, currentProvider),
  );
  const included = new Set(groups.map(({ provider }) => provider));
  for (const provider of providers) {
    if (included.has(provider.name)) continue;
    groups.push({
      provider: provider.name,
      label: PROVIDER_LABELS[provider.name] ?? provider.name,
      choices: [],
    });
  }
  return groups;
}

export function filterModelChoices(
  choices: readonly ModelChoice[],
  query: string,
): ModelChoice[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [...choices];
  return choices.filter((choice) =>
    choice.model.toLowerCase().includes(normalized)
    || choice.provider.toLowerCase().includes(normalized)
    || choice.displayName.toLowerCase().includes(normalized)
    || choice.location.includes(normalized),
  );
}

export function filterModelProviderGroups(
  groups: readonly ModelProviderGroup[],
  query: string,
): ModelProviderGroup[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [...groups];
  const providerMatches = groups.filter((group) =>
    group.provider.toLowerCase().includes(normalized)
    || group.label.toLowerCase().includes(normalized));
  if (providerMatches.length > 0) return providerMatches;
  return groups.filter((group) =>
    filterModelChoices(group.choices, normalized).length > 0);
}

export function ModelPicker({
  currentModel,
  currentProvider,
  hasCredential,
  onSelect,
  onCancel,
  isActive = true,
}: ModelPickerProps) {
  const { primary, accent, dim, warning, success } = useTheme();
  const columns = useTerminalColumns();
  const density = getTerminalDensity(columns);
  const visibleCount = density === "compact" ? 6 : density === "comfortable" ? 8 : 10;
  const providerCatalog = useMemo(
    () => listProviders(),
    [currentModel],
  );
  const allChoices = useMemo(
    () => buildModelChoices(providerCatalog, currentModel, currentProvider),
    [providerCatalog, currentModel, currentProvider],
  );
  const allProviderGroups = useMemo(
    () => buildModelProviderGroups(
      providerCatalog,
      currentModel,
      currentProvider,
    ),
    [providerCatalog, currentModel, currentProvider],
  );
  const resolvedCurrentProvider = currentProvider
    ?? allChoices.find((choice) => choice.model === currentModel)?.provider;
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const providerGroups = selectedProvider
    ? allProviderGroups
    : filterModelProviderGroups(allProviderGroups, query);
  const activeGroup = selectedProvider
    ? allProviderGroups.find((group) => group.provider === selectedProvider)
    : undefined;
  const modelChoices = activeGroup
    ? filterModelChoices(activeGroup.choices, query)
    : [];
  const itemCount = selectedProvider ? modelChoices.length : providerGroups.length;
  const selectedIndex = Math.min(selected, Math.max(0, itemCount - 1));
  const start = Math.min(
    Math.max(0, selectedIndex - Math.floor(visibleCount / 2)),
    Math.max(0, itemCount - visibleCount),
  );
  const visibleProviders = selectedProvider
    ? []
    : providerGroups.slice(start, start + visibleCount);
  const visibleModels = selectedProvider
    ? modelChoices.slice(start, start + visibleCount)
    : [];
  const rowWidth = Math.max(26, columns - 8);

  const returnToProviders = () => {
    setSelectedProvider(null);
    setQuery("");
    setSelected(0);
  };

  useInput((input, key) => {
    if (terminalReport(input)) return;
    if (key.escape) {
      if (selectedProvider) returnToProviders();
      else onCancel();
      return;
    }
    if (key.leftArrow && selectedProvider) {
      returnToProviders();
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
    if (key.return || (key.rightArrow && !selectedProvider)) {
      if (selectedProvider) {
        const choice = modelChoices[selectedIndex];
        if (choice) onSelect(choice.model, choice.provider);
      } else {
        const group = providerGroups[selectedIndex];
        if (group) {
          setSelectedProvider(group.provider);
          setQuery("");
          const currentIndex = group.choices.findIndex((choice) => choice.model === currentModel);
          setSelected(currentIndex >= 0 ? currentIndex : 0);
        }
      }
      return;
    }
    if (key.backspace || key.delete) {
      if (query.length > 0) {
        setQuery((value) => value.slice(0, -1));
        setSelected(0);
      } else if (selectedProvider) {
        returnToProviders();
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
        <Text color={primary} bold>Modell wählen</Text>
        <Text color={dim}>
          {"  ·  "}
          {selectedProvider && activeGroup
            ? `Provider › ${activeGroup.label}`
            : `${allProviderGroups.length} Provider · ${allChoices.length} Modelle`}
        </Text>
      </Text>
      <Text>
        <Text color={dim}>Suche  </Text>
        <Text color={accent}>
          {query || (selectedProvider ? "Modelle filtern" : "Provider oder Modell filtern")}
        </Text>
        {query ? <Text color={primary}>█</Text> : null}
      </Text>

      <Box flexDirection="column" marginTop={1}>
        {!selectedProvider && visibleProviders.length === 0 ? (
          <Text color={warning}>Kein Provider für „{query}“.</Text>
        ) : null}
        {!selectedProvider ? visibleProviders.map((group, visibleIndex) => {
          const absoluteIndex = start + visibleIndex;
          const isSelected = absoluteIndex === selectedIndex;
          const isCurrent = group.provider === resolvedCurrentProvider
            && group.choices.some((choice) => choice.model === currentModel);
          const location = group.choices[0]?.location ?? "hosted";
          const needsCredential = location === "hosted" && !hasCredential(group.provider);
          const refreshStatus = getProviderModelRefreshStatus(group.provider);
          const state = location === "local"
            ? "local"
            : location === "subscription"
              ? "Abo"
              : needsCredential
                ? "Key fehlt"
                : refreshStatus === "failed"
                  ? "nicht erreichbar"
                  : refreshStatus === "updated" || refreshStatus === "cached"
                    ? "live"
                    : "bereit";
          const modelNoun = group.choices.length === 1 ? "Modell" : "Modelle";
          const suffix = `${group.choices.length} ${modelNoun} · ${state}${isCurrent ? " · aktiv" : ""}  ›`;
          const labelWidth = Math.max(10, rowWidth - suffix.length - 3);
          const row = `${isSelected ? "›" : " "} ${fitText(group.label, labelWidth)}  ${suffix}`;
          return (
            <Text key={group.provider} inverse={isSelected}>
              <Text color={isSelected ? undefined : needsCredential ? warning : isCurrent ? success : location === "local" ? accent : undefined}>
                {fitText(row, rowWidth)}
              </Text>
            </Text>
          );
        }) : null}

        {selectedProvider && visibleModels.length === 0 ? (
          <Text color={warning}>Keine Modelle für „{query}“.</Text>
        ) : null}
        {selectedProvider ? visibleModels.map((choice, visibleIndex) => {
          const absoluteIndex = start + visibleIndex;
          const isSelected = absoluteIndex === selectedIndex;
          const isCurrent = choice.model === currentModel
            && choice.provider === resolvedCurrentProvider;
          const needsCredential =
            choice.location === "hosted" && !hasCredential(choice.provider);
          const state = needsCredential ? "Key fehlt" : isCurrent ? "aktiv" : "";
          const suffix = state ? `  ${state}` : "";
          const modelWidth = Math.max(12, rowWidth - suffix.length - 3);
          const row = `${isSelected ? "›" : " "} ${fitText(choice.model, modelWidth)}${suffix}`;
          return (
            <Text key={`${choice.provider}:${choice.model}`} inverse={isSelected}>
              <Text color={isSelected ? undefined : needsCredential ? warning : isCurrent ? success : undefined}>
                {fitText(row, rowWidth)}
              </Text>
            </Text>
          );
        }) : null}
      </Box>

      <Text color={dim}>
        {itemCount > 0 ? `${selectedIndex + 1}/${itemCount}` : "0/0"}
        {selectedProvider
          ? "  ·  ↑↓ Modell · Enter übernehmen · ←/Esc Provider"
          : "  ·  ↑↓ Provider · Enter/→ öffnen · Esc schließen"}
      </Text>
    </Box>
  );
}
