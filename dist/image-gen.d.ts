export declare const IMAGE_GEN_DIR: string;
export declare const IMAGE_OUTPUT_DIR: string;
export declare const IMAGE_MODELS: readonly [{
    readonly id: "sdxl-turbo";
    readonly name: "SDXL Turbo";
    readonly size: "~7GB";
    readonly description: "Blitzschnell (1-4 Steps), 512x512";
    readonly steps: 1;
    readonly resolution: "512x512";
}, {
    readonly id: "sdxl";
    readonly name: "Stable Diffusion XL";
    readonly size: "~7GB";
    readonly description: "Beste Qualitaet, 1024x1024";
    readonly steps: 30;
    readonly resolution: "1024x1024";
}, {
    readonly id: "sd15";
    readonly name: "Stable Diffusion 1.5";
    readonly size: "~4GB";
    readonly description: "Klassiker, leicht, laeuft ueberall";
    readonly steps: 25;
    readonly resolution: "512x512";
}];
export declare const DEFAULT_IMAGE_MODEL = "sdxl-turbo";
export declare function hasPython(): Promise<boolean>;
export declare function isSetupComplete(): Promise<boolean>;
export declare function setupImageGen(onProgress?: (s: string) => void): Promise<void>;
export declare function generateImage(prompt: string, options?: {
    model?: string;
    steps?: number;
    width?: number;
    height?: number;
    negativePrompt?: string;
    seed?: number;
    guidanceScale?: number;
}): Promise<{
    path: string;
    model: string;
    steps: number;
    resolution: string;
    seed: number;
    duration: number;
}>;
export declare function cleanupImageGen(): Promise<void>;
export declare function getAvailableMemoryGB(): number;
//# sourceMappingURL=image-gen.d.ts.map