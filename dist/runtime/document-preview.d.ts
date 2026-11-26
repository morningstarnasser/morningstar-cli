export interface DocumentLink {
    id: string;
    label: string;
    href: string;
    marker: string;
}
export interface DocumentPreview {
    title: string;
    path: string;
    text: string;
    line: number;
    markdown: boolean;
}
export declare function localDocumentHref(href: string): boolean;
/** Static terminal rows retain this small registry after React unmounts them. */
export declare class DocumentLinks {
    private next;
    private links;
    register(label: string, href: string): DocumentLink | undefined;
    get(id: string): DocumentLink | undefined;
    list(): DocumentLink[];
    clear(): void;
    hit(text: string, offset: number): DocumentLink | undefined;
}
export declare function readDocument(href: string, cwd: string, vault?: string, signal?: AbortSignal): Promise<DocumentPreview>;
export declare function relativeDocumentHref(href: string, document: string): string;
//# sourceMappingURL=document-preview.d.ts.map