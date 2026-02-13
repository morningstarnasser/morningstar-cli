// ─── Tool Definitions for Native Function Calling ─────────────────────────────
// Three formats: OpenAI, Anthropic, Google Gemini

export interface OpenAIToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, { type: string; description: string }>;
      required: string[];
    };
  };
}

export interface AnthropicToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
}

export interface GoogleFunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
}

// ─── OpenAI Format (also used by Groq, OpenRouter) ──────────────────────────

export const TOOL_DEFINITIONS: OpenAIToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "read",
      description: "Read a file and return its contents with line numbers",
      parameters: {
        type: "object",
        properties: {
          filePath: { type: "string", description: "Path to the file to read (relative or absolute)" },
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
      description: "Edit a file by finding and replacing a specific string. The oldStr must match exactly.",
      parameters: {
        type: "object",
        properties: {
          filePath: { type: "string", description: "Path to the file to edit" },
          oldStr: { type: "string", description: "The exact string to find in the file" },
          newStr: { type: "string", description: "The replacement string" },
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
      description: "Execute a shell command via bash. Use for running tests, installing packages, building projects, or any other shell operation. Timeout: 30 seconds.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "The shell command to execute" },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "grep",
      description: "Search file contents using grep with a regex pattern. Returns up to 50 matching lines with file paths and line numbers.",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Regex pattern to search for" },
          fileGlob: { type: "string", description: "Optional file glob to restrict search (e.g. '*.ts', '*.py')" },
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
];

// ─── Anthropic Format ───────────────────────────────────────────────────────

export const ANTHROPIC_TOOL_DEFINITIONS: AnthropicToolDefinition[] =
  TOOL_DEFINITIONS.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));

// ─── Google Gemini Format ───────────────────────────────────────────────────

export const GOOGLE_TOOL_DEFINITIONS: { functionDeclarations: GoogleFunctionDeclaration[] }[] = [
  {
    functionDeclarations: TOOL_DEFINITIONS.map((t) => ({
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters,
    })),
  },
];
