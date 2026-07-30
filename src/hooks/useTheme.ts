import { getTheme, type Theme } from "../theme.js";

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

export function useTheme(): InkThemeColors & { theme: Theme } {
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
