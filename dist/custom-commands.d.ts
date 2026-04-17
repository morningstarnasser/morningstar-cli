export interface CustomCommand {
    name: string;
    description: string;
    content: string;
    source: "global" | "project";
    agent?: string;
}
export declare function loadCustomCommands(cwd: string): CustomCommand[];
//# sourceMappingURL=custom-commands.d.ts.map