export declare const IMAGE_GEN_DIR: string;
export declare const IMAGE_OUTPUT_DIR: string;
export declare const IMAGE_MODELS: readonly [{
    readonly id: "gemini";
    readonly name: "Gemini 2.0 Flash (Nano Banana)";
    readonly size: "API";
    readonly description: "Beste Qualitaet, Cloud-basiert (Standard)";
    readonly steps: 0;
    readonly resolution: "1024x1024";
}, {
    readonly id: "realvis";
    readonly name: "RealVisXL V4.0";
    readonly size: "~7GB";
    readonly description: "Photorealistisch, lokal";
    readonly steps: 40;
    readonly resolution: "1024x1024";
}, {
    readonly id: "sdxl";
    readonly name: "Stable Diffusion XL";
    readonly size: "~7GB";
    readonly description: "Hohe Qualitaet, lokal";
    readonly steps: 40;
    readonly resolution: "1024x1024";
}, {
    readonly id: "sdxl-turbo";
    readonly name: "SDXL Turbo";
    readonly size: "~7GB";
    readonly description: "Schnell (1-4 Steps), lokal";
    readonly steps: 4;
    readonly resolution: "512x512";
}, {
    readonly id: "sd15";
    readonly name: "Stable Diffusion 1.5";
    readonly size: "~4GB";
    readonly description: "Klassiker, leicht, lokal";
    readonly steps: 30;
    readonly resolution: "512x512";
}];
export declare const DEFAULT_IMAGE_MODEL = "gemini";
export declare function startImageServer(onProgress?: (s: string) => void): Promise<void>;
export declare function stopImageServer(): Promise<void>;
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