import { type Theme } from "../theme.js";
export interface InkThemeColors {
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
export declare function useTheme(): InkThemeColors & {
    theme: Theme;
};
//# sourceMappingURL=useTheme.d.ts.map