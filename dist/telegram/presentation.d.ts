export declare const escapeTelegramHTML: (value: string) => string;
export interface TelegramPage {
    html: string;
    text: string;
}
/** Render our Markdown AST into Telegram's small HTML allowlist. Model HTML is
 * always text. Each page is independently balanced and safely below API limits. */
export declare function telegramPages(markdown: string, limit?: number): TelegramPage[];
export declare function telegramToolLabel(heading: string): string;
//# sourceMappingURL=presentation.d.ts.map