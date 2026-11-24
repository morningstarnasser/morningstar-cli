import type { ImageAttachment, Message } from "../types.js";
export declare const MAX_IMAGES = 20;
/** Snapshot the explicitly dropped file, so a rename or /resume cannot change its content. */
export declare function attachImage(path: string, id: number, cache?: string): ImageAttachment;
export declare function isImageAttachment(image: unknown): image is ImageAttachment;
export declare function imageData(image: ImageAttachment): string;
/** Validate all retained attachments before any provider request. */
export declare function conversationImages(messages: readonly Message[]): ImageAttachment[];
/** Shell-style quoting only; never executes, expands variables, globs or substitutions. */
export declare function droppedPaths(text: string, cwd: string): string[];
export declare class ImageDrafts {
    private cache?;
    private images;
    private next;
    constructor(seed?: ImageAttachment[], cache?: string | undefined);
    seed(images: ImageAttachment[]): void;
    paste(text: string, cwd: string): string;
    forText(text: string): ImageAttachment[];
}
//# sourceMappingURL=images.d.ts.map