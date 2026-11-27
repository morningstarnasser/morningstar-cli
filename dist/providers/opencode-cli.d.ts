import type { Message } from "../types.js";
import type { StreamToken } from "../providers.js";
/** OpenCode's official CLI owns access to its free tier. No client impersonation. */
export declare function isOpenCodeFreeModel(id: string): boolean;
export declare function discoverOpenCodeModels(): Promise<string[]>;
export declare function parseOpenCodeEvent(line: string): StreamToken | undefined;
export declare function openCodeCliStream(model: string, messages: Message[], signal?: AbortSignal): AsyncGenerator<StreamToken>;
//# sourceMappingURL=opencode-cli.d.ts.map