export interface ParsedFrontmatter<T> {
    frontmatter: T;
    content: string;
}
/**
 * Parse YAML-like frontmatter from a markdown string.
 * Supports --- delimited frontmatter blocks.
 * Returns parsed key-value pairs and the remaining content.
 */
export declare function parseFrontmatter<T = Record<string, unknown>>(raw: string): ParsedFrontmatter<T>;
/**
 * Serialize frontmatter and content back to a markdown string.
 */
export declare function serializeFrontmatter(frontmatter: Record<string, unknown>, content: string): string;
//# sourceMappingURL=frontmatter.d.ts.map