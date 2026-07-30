export interface Theme {
    name: string;
    primary: string;
    secondary: string;
    accent: string;
    success: string;
    error: string;
    warning: string;
    info: string;
    dim: string;
    prompt: string;
    star: string;
}
export declare const THEMES: Record<string, Theme>;
export declare function loadTheme(): Theme;
export declare function setTheme(themeId: string): boolean;
export declare function getTheme(): Theme;
export declare function getThemeId(): string;
export declare function listThemes(): Array<{
    id: string;
    name: string;
    active: boolean;
}>;
//# sourceMappingURL=theme.d.ts.map