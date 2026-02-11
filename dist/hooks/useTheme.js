import { getTheme } from "../theme.js";
export function useTheme() {
    const theme = getTheme();
    return {
        theme,
        primary: theme.primary,
        secondary: theme.secondary,
        accent: theme.accent,
        success: theme.success,
        error: theme.error,
        warning: theme.warning,
        info: theme.info,
        dim: theme.dim,
        prompt: theme.prompt,
        star: theme.star,
    };
}
//# sourceMappingURL=useTheme.js.map