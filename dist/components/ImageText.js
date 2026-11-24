import { jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { Text } from "ink";
export const IMAGE_FOREGROUND = "#b7a8ff";
export const IMAGE_BACKGROUND = "#252235";
/** Attachment labels keep a distinct color in drafts, queued and sent messages. */
export function ImageText({ text }) {
    return _jsx(_Fragment, { children: text.split(/(\[Image #\d+\])/g).map((part, i) => /^\[Image #\d+\]$/.test(part)
            ? _jsx(Text, { bold: true, color: IMAGE_FOREGROUND, backgroundColor: IMAGE_BACKGROUND, children: part }, i)
            : _jsx(Text, { children: part }, i)) });
}
//# sourceMappingURL=ImageText.js.map