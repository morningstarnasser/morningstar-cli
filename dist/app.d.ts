import type { Message, CLIConfig, ProjectContext } from "./types.js";
interface AppProps {
    config: CLIConfig;
    ctx: ProjectContext;
    chatOnly: boolean;
    skipPermissions: boolean;
    baseSystemPrompt: string;
    sessionStart: number;
    getStoredApiKey: (provider: string) => string;
    storeApiKey: (provider: string, key: string) => void;
    saveConfig: (data: Record<string, unknown>) => void;
    resumedMessages?: Message[];
}
export declare function App({ config: initialConfig, ctx, chatOnly, skipPermissions, baseSystemPrompt, sessionStart, getStoredApiKey, storeApiKey, saveConfig, resumedMessages }: AppProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=app.d.ts.map