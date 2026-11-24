export interface SecretInputProps {
    label: string;
    /** Second line below the prompt, e.g. where to get the key. */
    hint?: string;
    onSubmit: (value: string) => void;
    onCancel: () => void;
    isActive?: boolean;
}
/** Render a secret as dots, never as characters. */
export declare function maskSecret(value: string): string;
/**
 * Hidden single-line input for API keys.
 *
 * Ink has no password field, so keystrokes are buffered here and only ever
 * rendered as dots. Pasting works because a paste arrives as one multi-character
 * `input` event.
 */
export declare function SecretInput({ label, hint, onSubmit, onCancel, isActive, }: SecretInputProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=SecretInput.d.ts.map