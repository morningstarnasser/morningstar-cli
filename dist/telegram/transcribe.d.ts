export type TranscribeFn = (audio: Buffer, mime: string) => Promise<string>;
/**
 * Decide which STT command to use. Pure (env + existence injected) for testing.
 * Returns a command template; the audio file path is appended at call time.
 */
export declare function resolveSttCommand(env: NodeJS.ProcessEnv, fileExists?: (p: string) => boolean): string | null;
/** Build a TranscribeFn that writes the audio to a temp file and runs `cmd <file>`. */
export declare function commandTranscriber(cmd: string, clock?: () => number): TranscribeFn;
/** The transcriber resolved from the environment, or null if none configured. */
export declare function resolveTranscriber(): TranscribeFn | null;
//# sourceMappingURL=transcribe.d.ts.map