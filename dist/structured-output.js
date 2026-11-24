import { Ajv } from "ajv";
/** Compile before contacting a provider. Remote refs and custom executable keywords are unavailable. */
export function createOutputValidator(schemaText) {
    if (Buffer.byteLength(schemaText) > 65536)
        throw new Error("JSON schema exceeds 64 KiB");
    const schema = JSON.parse(schemaText);
    if (!schema || typeof schema !== "object" || Array.isArray(schema) || schema.$async)
        throw new Error("Expected a synchronous JSON Schema object");
    const ajv = new Ajv({ strict: true, allErrors: false, coerceTypes: false, useDefaults: false, removeAdditional: false });
    const validate = ajv.compile(schema);
    return (text) => {
        if (Buffer.byteLength(text) > 8 * 1024 * 1024)
            return { error: "Structured output exceeds 8 MiB" };
        try {
            const value = JSON.parse(text.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/, "$1"));
            if (!validate(value))
                return { error: ajv.errorsText(validate.errors) };
            return { value };
        }
        catch {
            return { error: "Response is not valid JSON" };
        }
    };
}
//# sourceMappingURL=structured-output.js.map