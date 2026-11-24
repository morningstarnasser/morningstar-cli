import type { AuthOptionState, AuthVendorGroup } from "../auth.js";
export interface LoginPickerProps {
    groups: AuthVendorGroup[];
    /** Provider currently backing the session, marked as active. */
    activeProvider?: string;
    onSelect: (state: AuthOptionState) => void;
    onCancel: () => void;
    isActive?: boolean;
}
/** Filter vendors by a free-text query; matches vendor name and option labels. */
export declare function filterAuthGroups(groups: readonly AuthVendorGroup[], query: string): AuthVendorGroup[];
/** Worst-case-free summary for a vendor row: ready wins over anything else. */
export declare function vendorSummary(group: AuthVendorGroup): string;
export declare function LoginPicker({ groups, activeProvider, onSelect, onCancel, isActive, }: LoginPickerProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=LoginPicker.d.ts.map