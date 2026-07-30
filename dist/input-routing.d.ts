export interface InputRunContext {
    effectiveAgentId?: string;
    /**
     * Project/global custom-command content is a prompt template, never a second
     * line of trusted terminal input.
     */
    promptTemplate?: boolean;
}
export type LocalInputRoute = "prompt" | "slash" | "bang" | "cd";
export declare function classifyLocalInput(input: string, runContext?: InputRunContext): LocalInputRoute;
//# sourceMappingURL=input-routing.d.ts.map