import type { ProviderCatalogEntry } from "../providers.js";
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
/**
 * Flatten the shared provider catalog into contiguous provider groups. The
 * active provider comes first, followed by local, subscription, and hosted
 * providers. The active model remains first inside its provider.
 */
export declare function buildModelChoices(providers: readonly ProviderCatalogEntry[], currentModel: string, currentProvider?: string): ModelChoice[];
export declare function groupModelChoices(choices: readonly ModelChoice[]): ModelProviderGroup[];
export declare function buildModelProviderGroups(providers: readonly ProviderCatalogEntry[], currentModel: string, currentProvider?: string): ModelProviderGroup[];
export declare function filterModelChoices(choices: readonly ModelChoice[], query: string): ModelChoice[];
export declare function filterModelProviderGroups(groups: readonly ModelProviderGroup[], query: string): ModelProviderGroup[];
export declare function ModelPicker({ currentModel, currentProvider, hasCredential, onSelect, onCancel, isActive, }: ModelPickerProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=ModelPicker.d.ts.map