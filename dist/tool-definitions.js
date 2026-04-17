// ─── Tool Definitions for Native Function Calling ─────────────────────────────
// Three formats: OpenAI, Anthropic, Google Gemini
// ─── OpenAI Format (also used by Groq, OpenRouter) ──────────────────────────
export const TOOL_DEFINITIONS = [
    {
        type: "function",
        function: {
            name: "read",
            description: "Read a file and return its contents with line numbers. Supports offset/limit for reading specific line ranges of large files.",
            parameters: {
                type: "object",
                properties: {
                    filePath: { type: "string", description: "Path to the file to read (relative or absolute)" },
                    offset: { type: "number", description: "1-indexed start line number. Only provide for large files." },
                    limit: { type: "number", description: "Maximum number of lines to read. Only provide for large files." },
                },
                required: ["filePath"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "write",
            description: "Write content to a file. Creates the file and parent directories if they don't exist. Overwrites existing content.",
            parameters: {
                type: "object",
                properties: {
                    filePath: { type: "string", description: "Path to the file to write" },
                    content: { type: "string", description: "The full content to write to the file" },
                },
                required: ["filePath", "content"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "edit",
            description: "Edit a file by finding and replacing a specific string. The oldStr must match exactly. Use replaceAll to replace all occurrences.",
            parameters: {
                type: "object",
                properties: {
                    filePath: { type: "string", description: "Path to the file to edit" },
                    oldStr: { type: "string", description: "The exact string to find in the file" },
                    newStr: { type: "string", description: "The replacement string" },
                    replaceAll: { type: "boolean", description: "Replace ALL occurrences of oldStr, not just the first. Default: false." },
                },
                required: ["filePath", "oldStr", "newStr"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "delete",
            description: "Delete a file from the filesystem",
            parameters: {
                type: "object",
                properties: {
                    filePath: { type: "string", description: "Path to the file to delete" },
                },
                required: ["filePath"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "bash",
            description: "Execute a shell command via bash. Supports configurable timeout (default 30s, max 600s) and background execution.",
            parameters: {
                type: "object",
                properties: {
                    command: { type: "string", description: "The shell command to execute" },
                    timeout: { type: "number", description: "Timeout in seconds (default: 30, max: 600)" },
                    run_in_background: { type: "boolean", description: "Run command in background and return a task ID for later status checks" },
                },
                required: ["command"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "grep",
            description: "Search file contents using grep with a regex pattern. Supports context lines (-A/-B/-C), case sensitivity, and result limits.",
            parameters: {
                type: "object",
                properties: {
                    pattern: { type: "string", description: "Regex pattern to search for" },
                    fileGlob: { type: "string", description: "Optional file glob to restrict search (e.g. '*.ts', '*.py')" },
                    contextBefore: { type: "number", description: "Lines to show before each match (grep -B)" },
                    contextAfter: { type: "number", description: "Lines to show after each match (grep -A)" },
                    context: { type: "number", description: "Lines to show before AND after each match (grep -C). Overrides contextBefore/contextAfter." },
                    caseSensitive: { type: "boolean", description: "Case-sensitive search. Default: true." },
                    maxResults: { type: "number", description: "Maximum number of result lines. Default: 50, max: 500." },
                },
                required: ["pattern"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "glob",
            description: "Find files matching a glob pattern. Useful for discovering project structure.",
            parameters: {
                type: "object",
                properties: {
                    pattern: { type: "string", description: "Glob pattern (e.g. 'src/**/*.ts', '**/*.json')" },
                },
                required: ["pattern"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "ls",
            description: "List directory contents with file sizes.",
            parameters: {
                type: "object",
                properties: {
                    dirPath: { type: "string", description: "Path to the directory to list. Defaults to current directory." },
                },
                required: [],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "git",
            description: "Show git repository status including current branch, changed files, and recent commits.",
            parameters: {
                type: "object",
                properties: {},
                required: [],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "web",
            description: "Search the web using DuckDuckGo. Returns up to 8 results with titles, URLs and snippets.",
            parameters: {
                type: "object",
                properties: {
                    query: { type: "string", description: "Search query string" },
                },
                required: ["query"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "fetch",
            description: "Fetch the content of a URL. Returns text content with HTML stripped. Timeout: 15 seconds.",
            parameters: {
                type: "object",
                properties: {
                    url: { type: "string", description: "The URL to fetch (http or https)" },
                },
                required: ["url"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "gh",
            description: "Run a GitHub CLI (gh) command. Requires gh to be installed and authenticated.",
            parameters: {
                type: "object",
                properties: {
                    command: { type: "string", description: "Arguments to pass to gh (e.g. 'pr list', 'issue create --title ...')" },
                },
                required: ["command"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "notebook_edit",
            description: "Edit a Jupyter notebook (.ipynb) cell. Supports replace, insert, and delete operations on cells.",
            parameters: {
                type: "object",
                properties: {
                    notebookPath: { type: "string", description: "Path to the .ipynb notebook file" },
                    cellNumber: { type: "number", description: "0-indexed cell number to operate on" },
                    editMode: { type: "string", description: "Operation: 'replace', 'insert', or 'delete'" },
                    cellType: { type: "string", description: "Cell type: 'code' or 'markdown'. Required for insert." },
                    newSource: { type: "string", description: "New cell content. Required for replace and insert." },
                },
                required: ["notebookPath", "cellNumber", "editMode"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "bg_status",
            description: "Check the status and output of a background task by its task ID.",
            parameters: {
                type: "object",
                properties: {
                    taskId: { type: "string", description: "The background task ID returned by bash with run_in_background=true" },
                },
                required: ["taskId"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "bg_list",
            description: "List all background tasks with their status (running/done).",
            parameters: {
                type: "object",
                properties: {},
                required: [],
            },
        },
    },
];
// ─── Anthropic Format ───────────────────────────────────────────────────────
export const ANTHROPIC_TOOL_DEFINITIONS = TOOL_DEFINITIONS.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
}));
// ─── Google Gemini Format ───────────────────────────────────────────────────
export const GOOGLE_TOOL_DEFINITIONS = [
    {
        functionDeclarations: TOOL_DEFINITIONS.map((t) => ({
            name: t.function.name,
            description: t.function.description,
            parameters: t.function.parameters,
        })),
    },
];
//# sourceMappingURL=tool-definitions.js.map