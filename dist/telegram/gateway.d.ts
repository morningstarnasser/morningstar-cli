import { type StreamFn, type TextToolExecFn } from "../agent-runner.js";
import { TelegramClient, type TelegramUpdate } from "./api.js";
import { type TranscribeFn } from "./transcribe.js";
import { type TelegramConfig } from "./config.js";
import { SessionStore } from "./sessions.js";
import { Brain } from "../brain/store.js";
/** Test seam: inject a fake Telegram client and/or model stream. */
export interface GatewayDeps {
    client?: TelegramClient;
    streamFn?: StreamFn;
    textToolExecFn?: TextToolExecFn;
    brain?: Brain;
    transcribe?: TranscribeFn;
    approvalTimeoutMs?: number;
    /** Inject storage explicitly; fake-client test seams default to memory-only. */
    sessionStore?: SessionStore;
}
export declare class TelegramGateway {
    private config;
    private client;
    private store;
    private offset;
    private running;
    private active;
    private getStoredApiKey;
    private cronTimer?;
    private cronRunning;
    private streamFn?;
    private textToolExecFn?;
    private brain;
    private pendingApprovals;
    private approvalSeq;
    private approvalTimeoutMs;
    private lastDistillDay;
    private transcribe?;
    constructor(config: TelegramConfig, deps?: GatewayDeps);
    /** Drive a single update to completion. Public seam for integration tests. */
    processUpdate(update: TelegramUpdate): Promise<void>;
    start(): Promise<void>;
    stop(): void;
    private handleUpdate;
    /** Transcribe a voice/audio message and run it as a normal prompt. */
    private handleVoice;
    private handleCommand;
    /** /model with no arg → show the picker keyboard; with an arg → set directly. */
    private showOrSetModel;
    private setModel;
    private setCwd;
    private handleCallback;
    private handleApprovalCallback;
    private handlePrompt;
    /** Run the agent for the chat's current session and reply. */
    private runAndReply;
    /** Resolve an agent `ask` verdict through a Telegram inline keyboard. */
    private requestApproval;
    private cancelApprovalsForChat;
    private runForChat;
    /** /parallel — fan out several tasks to concurrent agents and aggregate. */
    private handleParallel;
    /** Carry's persona block (SOUL/USER/MEMORY/AGENTS), reloaded per request so edits apply live. */
    private systemPrefix;
    /** Resilient stream over the model fallback chain (or the injected test stream). */
    private buildStreamFn;
    private buildConfig;
    private tickCron;
    private runCronJob;
    /** Distill the day's task outcomes into durable lessons stored back in the brain. */
    private runDistillation;
    private handleCron;
    private statusText;
    private log;
}
/** Entry point used by the CLI subcommand. */
export declare function startGateway(): Promise<void>;
//# sourceMappingURL=gateway.d.ts.map