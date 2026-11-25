export interface ImageBackend {
    name: string;
    command: string;
    args: string[];
    timeoutMs: number;
}
export declare function loadImageBackend(path?: string): ImageBackend | undefined;
/** Only an explicitly configured global backend is executable. Requests use stdin, never a shell. */
export declare function runImageBackend(backend: ImageBackend, prompt: string, options: Record<string, unknown>, output: string): Promise<{
    path: string;
    model: string;
    resolution: string;
    seed: number;
    steps: number;
    duration: number;
}>;
//# sourceMappingURL=image-backend.d.ts.map