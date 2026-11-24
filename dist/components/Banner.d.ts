import type { CLIConfig, ProjectContext } from "../types.js";
interface BannerProps {
    config: CLIConfig;
    ctx: ProjectContext;
    skipPermissions: boolean;
    frame?: number;
}
export declare function Banner({ config, ctx, skipPermissions, frame }: BannerProps): import("react/jsx-runtime").JSX.Element;
/** Local state only: startup frames never rerender the app or delay input. */
export declare function StartupBanner({ onDone, ...props }: BannerProps & {
    onDone: () => void;
}): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=Banner.d.ts.map