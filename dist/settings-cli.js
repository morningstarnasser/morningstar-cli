import { lstatSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseSettings, resolveSettings } from "./settings-sources.js";
/** Read-only validation: prints names of keys, never settings values or credentials. */
export function runSettingsCli(args, cwd) {
    if (args[0] === "sources" && args.length === 1) {
        console.log(JSON.stringify(resolveSettings(cwd).files, null, 2));
        return 0;
    }
    if (args[0] !== "check" || args.length !== 2) {
        console.error("Usage: morningstar settings check <json-file> | morningstar settings sources");
        return 2;
    }
    const path = resolve(cwd, args[1]);
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1048576)
        throw new Error("Settings must be a regular JSON file under 1 MiB");
    let value;
    try {
        value = JSON.parse(readFileSync(path, "utf8"));
    }
    catch {
        throw new Error("Invalid settings JSON (values omitted)");
    }
    const keys = value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value) : [];
    try {
        parseSettings(value, path);
        console.log(JSON.stringify({ file: path, valid: true, keys, imported: false }, null, 2));
        return 0;
    }
    catch (error) {
        console.log(JSON.stringify({ file: path, valid: false, keys, error: error.message, imported: false }, null, 2));
        return 1;
    }
}
//# sourceMappingURL=settings-cli.js.map