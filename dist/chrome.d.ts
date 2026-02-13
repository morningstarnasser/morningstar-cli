export interface ChromeConfig {
    debugPort: number;
    host: string;
}
/**
 * Check if Chrome is running with debugging port.
 */
export declare function isChromeRunning(): Promise<boolean>;
/**
 * Launch Chrome with debugging port.
 */
export declare function launchChrome(url?: string): {
    success: boolean;
    message: string;
};
/**
 * Get list of open Chrome tabs/pages.
 */
export declare function getPages(): Promise<Array<{
    id: string;
    title: string;
    url: string;
}>>;
/**
 * Navigate to a URL.
 */
export declare function navigate(pageId: string, url: string): Promise<{
    success: boolean;
    message: string;
}>;
/**
 * Take a screenshot.
 */
export declare function screenshot(pageId: string): Promise<{
    success: boolean;
    data?: string;
    message: string;
}>;
/**
 * Evaluate JavaScript on the page.
 */
export declare function evaluate(pageId: string, expression: string): Promise<{
    success: boolean;
    result?: unknown;
    message: string;
}>;
/**
 * Click on an element by selector.
 */
export declare function click(pageId: string, selector: string): Promise<{
    success: boolean;
    message: string;
}>;
/**
 * Type text into an element.
 */
export declare function type(pageId: string, selector: string, text: string): Promise<{
    success: boolean;
    message: string;
}>;
/**
 * Get Chrome integration status display.
 */
export declare function getChromeStatus(): Promise<string>;
//# sourceMappingURL=chrome.d.ts.map