import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { terminalReport } from "../runtime/composer-layout.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import { getModelDisplayName, listProviders, isLocalOllamaHost } from "../providers.js";
import { getProviderModelRefreshStatus, getProviderModelEndpoint } from "../provider-model-discovery.js";
import { useTerminalColumns } from "../hooks/useTerminalColumns.js";
import { useTheme } from "../hooks/useTheme.js";
import { fitText, getTerminalDensity } from "../tui-layout.js";
function modelLocation(provider, deployment) {
    if (deployment === "hosted")
        return "hosted";
    if (deployment === "local" || provider === "ollama" || provider === "hydra-local") {
        return "local";
    }
    if (provider === "claude-cli" || provider === "codex-cli")
        return "subscription";
    return "hosted";
}
/**
 * Flatten the shared provider catalog into contiguous provider groups. The
 * active provider comes first, followed by local, subscription, and hosted
 * providers. The active model remains first inside its provider.
 */
export function buildModelChoices(providers, currentModel, currentProvider) {
    const choices = providers.flatMap((provider, providerIndex) => provider.models
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
    }));
    const resolvedCurrentProvider = currentProvider
        ?? choices.find((choice) => choice.model === currentModel)?.provider;
    const providerPriority = (choice) => {
        if (choice.provider === resolvedCurrentProvider)
            return 0;
        if (choice.location === "local")
            return 1;
        if (choice.location === "subscription")
            return 2;
        return 3;
    };
    return choices
        .sort((left, right) => {
        return providerPriority(left) - providerPriority(right)
            || left.providerIndex - right.providerIndex
            || Number(right.model === currentModel
                && right.provider === resolvedCurrentProvider)
                - Number(left.model === currentModel
                    && left.provider === resolvedCurrentProvider)
            || left.modelIndex - right.modelIndex;
    })
        .map(({ providerIndex: _providerIndex, modelIndex: _modelIndex, ...choice }) => choice);
}
const PROVIDER_LABELS = {
    "free-models": "Free_Models",
    opencode: "OpenCode",
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
const providerLabel = (provider) => provider === "ollama" && !isLocalOllamaHost(getProviderModelEndpoint("ollama"))
    ? "Ollama · Server" : PROVIDER_LABELS[provider] ?? provider;
export function groupModelChoices(choices) {
    const groups = [];
    for (const choice of choices) {
        const previous = groups.at(-1);
        if (previous?.provider === choice.provider) {
            previous.choices.push(choice);
            continue;
        }
        groups.push({
            provider: choice.provider,
            label: providerLabel(choice.provider),
            choices: [choice],
        });
    }
    return groups;
}
export function buildModelProviderGroups(providers, currentModel, currentProvider) {
    const groups = groupModelChoices(buildModelChoices(providers, currentModel, currentProvider));
    const included = new Set(groups.map(({ provider }) => provider));
    for (const provider of providers) {
        if (included.has(provider.name))
            continue;
        groups.push({
            provider: provider.name,
            label: providerLabel(provider.name),
            choices: [],
        });
    }
    return groups;
}
export function filterModelChoices(choices, query) {
    const normalized = query.trim().toLowerCase();
    if (!normalized)
        return [...choices];
    return choices.filter((choice) => choice.model.toLowerCase().includes(normalized)
        || choice.provider.toLowerCase().includes(normalized)
        || choice.displayName.toLowerCase().includes(normalized)
        || choice.location.includes(normalized));
}
export function filterModelProviderGroups(groups, query) {
    const normalized = query.trim().toLowerCase();
    if (!normalized)
        return [...groups];
    const providerMatches = groups.filter((group) => group.provider.toLowerCase().includes(normalized)
        || group.label.toLowerCase().includes(normalized));
    if (providerMatches.length > 0)
        return providerMatches;
    return groups.filter((group) => filterModelChoices(group.choices, normalized).length > 0);
}
export function modelEmptyState(provider, query, status, refreshing = false) {
    if (refreshing)
        return "Modelle werden abgerufen …";
    if (provider === "opencode" && (status === "failed" || status === "skipped"))
        return "OpenCode CLI 2 installieren oder Verbindung prüfen; Ctrl+R aktualisiert die Gratis-Modelle.";
    if (provider === "free-models" && status === "skipped")
        return "Lokalen Our Free Model Gateway starten. Morningstar liest dessen Schlüssel automatisch; Ctrl+R aktualisiert.";
    if (status === "failed")
        return provider === "ollama" ? "Ollama nicht erreichbar. Server starten oder Verbindung prüfen; Ctrl+R wiederholt den Abruf." : "Katalogabruf fehlgeschlagen. Verbindung und API-Key prüfen; Ctrl+R erneut.";
    if (query)
        return `Keine Modelle für „${query}“.`;
    if (provider === "ollama" && (status === "updated" || status === "cached"))
        return "Ollama erreichbar · keine Modelle installiert. Neu installierte Modelle erscheinen automatisch.";
    if (status === "skipped")
        return "Kein API-Key für diesen Provider eingerichtet.";
    return "Dieser Provider meldet keine verfügbaren Modelle.";
}
export function ModelPicker({ currentModel, currentProvider, hasCredential, onSelect, onCancel, onRefresh, isActive = true, }) {
    const { primary, accent, dim, warning, success } = useTheme();
    const columns = useTerminalColumns();
    const density = getTerminalDensity(columns);
    const visibleCount = density === "compact" ? 6 : density === "comfortable" ? 8 : 10;
    const [revision, setRevision] = useState(0);
    const [refreshing, setRefreshing] = useState(Boolean(onRefresh));
    const [refreshError, setRefreshError] = useState(false);
    const [checkedAt, setCheckedAt] = useState();
    const refreshCallback = useRef(onRefresh);
    refreshCallback.current = onRefresh;
    const refreshAction = useRef(() => { });
    useEffect(() => {
        if (!isActive || !refreshCallback.current) {
            setRefreshing(false);
            return;
        }
        let mounted = true, running = false;
        const refresh = async () => {
            if (running || !mounted)
                return;
            running = true;
            setRefreshing(true);
            try {
                await refreshCallback.current?.();
                if (mounted) {
                    setRefreshError(false);
                    setCheckedAt(new Date().toLocaleTimeString());
                }
            }
            catch {
                if (mounted)
                    setRefreshError(true);
            }
            finally {
                running = false;
                if (mounted) {
                    setRevision(v => v + 1);
                    setRefreshing(false);
                }
            }
        };
        refreshAction.current = () => { void refresh(); };
        void refresh();
        const timer = setInterval(() => { void refresh(); }, 30_000);
        return () => { mounted = false; clearInterval(timer); refreshAction.current = () => { }; };
    }, [isActive]);
    const providerCatalog = useMemo(() => listProviders(), [currentModel, revision]);
    const allChoices = useMemo(() => buildModelChoices(providerCatalog, currentModel, currentProvider), [providerCatalog, currentModel, currentProvider]);
    const allProviderGroups = useMemo(() => buildModelProviderGroups(providerCatalog, currentModel, currentProvider), [providerCatalog, currentModel, currentProvider]);
    const resolvedCurrentProvider = currentProvider
        ?? allChoices.find((choice) => choice.model === currentModel)?.provider;
    const [selectedProvider, setSelectedProvider] = useState(null);
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
    const start = Math.min(Math.max(0, selectedIndex - Math.floor(visibleCount / 2)), Math.max(0, itemCount - visibleCount));
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
        if (terminalReport(input))
            return;
        if (key.ctrl && input === "r") {
            refreshAction.current();
            return;
        }
        if (key.escape) {
            if (selectedProvider)
                returnToProviders();
            else
                onCancel();
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
                if (refreshing)
                    return;
                const choice = modelChoices[selectedIndex];
                if (choice)
                    onSelect(choice.model, choice.provider);
            }
            else {
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
            }
            else if (selectedProvider) {
                returnToProviders();
            }
            return;
        }
        if (input && !key.ctrl && !key.meta) {
            setQuery((value) => value + input);
            setSelected(0);
        }
    }, { isActive });
    return (_jsxs(Box, { borderStyle: "round", borderColor: primary, flexDirection: "column", paddingX: 1, marginX: 1, marginY: 1, children: [_jsxs(Text, { children: [_jsx(Text, { color: primary, bold: true, children: "Modell w\u00E4hlen" }), _jsxs(Text, { color: dim, children: ["  ·  ", selectedProvider && activeGroup
                                ? `Provider › ${activeGroup.label}`
                                : `${allProviderGroups.length} Provider · ${allChoices.length} Modelle`] })] }), _jsxs(Text, { children: [_jsx(Text, { color: dim, children: "Suche  " }), _jsx(Text, { color: accent, children: query || (selectedProvider ? "Modelle filtern" : "Provider oder Modell filtern") }), query ? _jsx(Text, { color: primary, children: "\u2588" }) : null] }), _jsx(Text, { color: refreshError ? warning : dim, children: refreshing ? "Kataloge werden frisch abgerufen …" : refreshError ? "Abruf fehlgeschlagen · Ctrl+R erneut versuchen" : checkedAt ? `Abgleich ${checkedAt} · automatisch alle 30 s · Ctrl+R jetzt` : "Ctrl+R aktualisieren" }), !refreshing && selectedProvider === resolvedCurrentProvider
                && getProviderModelRefreshStatus(selectedProvider ?? "") === "updated"
                && activeGroup && !activeGroup.choices.some(choice => choice.model === currentModel) ? (_jsx(Text, { color: warning, children: "Das aktive Modell wird nicht mehr angeboten. Bitte ein verf\u00FCgbares Modell w\u00E4hlen." })) : null, _jsxs(Box, { flexDirection: "column", marginTop: 1, children: [!selectedProvider && visibleProviders.length === 0 ? (_jsxs(Text, { color: warning, children: ["Kein Provider f\u00FCr \u201E", query, "\u201C."] })) : null, !selectedProvider ? visibleProviders.map((group, visibleIndex) => {
                        const absoluteIndex = start + visibleIndex;
                        const isSelected = absoluteIndex === selectedIndex;
                        const isCurrent = group.provider === resolvedCurrentProvider
                            && group.choices.some((choice) => choice.model === currentModel);
                        const location = group.choices[0]?.location ?? modelLocation(group.provider);
                        const needsCredential = location === "hosted" && !hasCredential(group.provider);
                        const refreshStatus = getProviderModelRefreshStatus(group.provider);
                        const state = location === "subscription"
                            ? "Abo"
                            : needsCredential
                                ? "Key fehlt"
                                : refreshStatus === "failed"
                                    ? "Abruf fehlgeschlagen"
                                    : refreshStatus === "updated" || refreshStatus === "cached"
                                        ? group.choices.length ? "live" : "leer"
                                        : "bereit";
                        const modelNoun = group.choices.length === 1 ? "Modell" : "Modelle";
                        const suffix = `${group.choices.length} ${modelNoun} · ${state}${isCurrent ? " · aktiv" : ""}  ›`;
                        const labelWidth = Math.max(10, rowWidth - suffix.length - 3);
                        const row = `${isSelected ? "›" : " "} ${fitText(group.label, labelWidth)}  ${suffix}`;
                        return (_jsx(Text, { inverse: isSelected, children: _jsx(Text, { color: isSelected ? undefined : needsCredential ? warning : isCurrent ? success : location === "local" ? accent : undefined, children: fitText(row, rowWidth) }) }, group.provider));
                    }) : null, selectedProvider && visibleModels.length === 0 ? (_jsx(Text, { color: warning, children: modelEmptyState(selectedProvider, query, getProviderModelRefreshStatus(selectedProvider), refreshing) })) : null, selectedProvider ? visibleModels.map((choice, visibleIndex) => {
                        const absoluteIndex = start + visibleIndex;
                        const isSelected = absoluteIndex === selectedIndex;
                        const isCurrent = choice.model === currentModel
                            && choice.provider === resolvedCurrentProvider;
                        const needsCredential = choice.location === "hosted" && !hasCredential(choice.provider);
                        const state = needsCredential ? "Key fehlt" : isCurrent ? "aktiv" : "";
                        const suffix = state ? `  ${state}` : "";
                        const modelWidth = Math.max(12, rowWidth - suffix.length - 3);
                        const row = `${isSelected ? "›" : " "} ${fitText(choice.model, modelWidth)}${suffix}`;
                        return (_jsx(Text, { inverse: isSelected, children: _jsx(Text, { color: isSelected ? undefined : needsCredential ? warning : isCurrent ? success : undefined, children: fitText(row, rowWidth) }) }, `${choice.provider}:${choice.model}`));
                    }) : null] }), _jsxs(Text, { color: dim, children: [itemCount > 0 ? `${selectedIndex + 1}/${itemCount}` : "0/0", selectedProvider
                        ? "  ·  ↑↓ Modell · Enter übernehmen · ←/Esc Provider"
                        : "  ·  ↑↓ Provider · Enter/→ öffnen · Esc schließen"] })] }));
}
//# sourceMappingURL=ModelPicker.js.map