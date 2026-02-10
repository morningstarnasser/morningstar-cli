export interface VisionModel {
    id: string;
    name: string;
    size: string;
    description: string;
}
export declare const VISION_MODELS: VisionModel[];
export declare const DEFAULT_VISION_MODEL = "moondream";
export declare function isImageFile(filePath: string): boolean;
export declare function isOllamaRunning(): Promise<boolean>;
export declare function isVisionModelInstalled(model?: string): Promise<boolean>;
export declare function getInstalledVisionModels(): Promise<string[]>;
export declare function pullVisionModel(model?: string, onProgress?: (status: string) => void): Promise<void>;
export declare function analyzeImage(imagePath: string, prompt?: string, model?: string): AsyncGenerator<string>;
export declare function analyzeImageFull(imagePath: string, prompt?: string, model?: string): Promise<string>;
//# sourceMappingURL=vision.d.ts.map