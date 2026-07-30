export interface MenuModel {
    model: string;
    provider: string;
}
/** Curated, stable-ordered picker. Index position is the callback contract. */
export declare const MODEL_MENU: MenuModel[];
export interface InlineButton {
    text: string;
    callback_data: string;
}
/**
 * Build the inline keyboard (2 columns). `hasKeyFn` decides the ✅/🔑 marker;
 * `current` highlights the active model. Pure + testable.
 */
export declare function buildModelKeyboard(hasKeyFn: (provider: string) => boolean, current?: string): InlineButton[][];
/** Resolve a callback_data string ("m:<i>") back to a model id, or null. */
export declare function modelFromCallback(data: string): string | null;
/**
 * A readable, provider-grouped catalog shown above the keyboard. If `hasKeyFn`
 * is given, each model gets a ✅/🔑 marker; the current model gets ●.
 */
export declare function modelMenuText(current?: string, hasKeyFn?: (provider: string) => boolean): string;
/** Validate that a provider matches a model — used to warn on manual /model. */
export declare function providerOf(model: string): string;
//# sourceMappingURL=models-menu.d.ts.map