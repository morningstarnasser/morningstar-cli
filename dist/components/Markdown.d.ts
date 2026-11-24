import { type Token } from "marked";
/** No HTML/ANSI execution: Markdown becomes Ink elements, never terminal commands. */
export declare function markdownTokens(text: string): Token[];
export declare function Markdown({ text }: {
    text: string;
}): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=Markdown.d.ts.map