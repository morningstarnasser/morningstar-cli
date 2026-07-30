export interface DepNode {
    path: string;
    shortName: string;
    imports: string[];
    importedBy: string[];
}
export interface DepGraph {
    nodes: DepNode[];
    edges: Array<{
        from: string;
        to: string;
    }>;
}
export declare function buildDepGraph(cwd: string): DepGraph;
export declare function renderDepGraphAscii(graph: DepGraph, maxWidth?: number): string;
//# sourceMappingURL=dep-graph.d.ts.map