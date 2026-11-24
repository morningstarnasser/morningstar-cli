import type { Readable } from "node:stream";
export declare function parseUserInput(line: string): string;
/** Read to EOF, without losing slow pipe writers; NDJSON yields before EOF. */
export declare function readPrintInput(input: Readable, format: "text" | "stream-json"): AsyncGenerator<string>;
//# sourceMappingURL=print-input.d.ts.map