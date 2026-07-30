// ─── Voice transcription (pluggable STT) ─────────────────────────────────────
// Telegram voice messages are downloaded and handed to a Transcriber. The
// default shells out to a command (env MORNINGSTAR_STT_CMD, or the local NVIDIA
// Omni analyzer skill if present — NVIDIA key is available), so it works the
// moment a real STT is pointed at it. Channel-agnostic: WhatsApp/other adapters
// can reuse the same TranscribeFn.

import { execFileSync } from "node:child_process";
import { writeFileSync, unlinkSync, existsSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";

export type TranscribeFn = (audio: Buffer, mime: string) => Promise<string>;

const OMNI_SCRIPT = join(homedir(), ".claude/skills/nvidia-omni-analyzer/scripts/analyze.py");

/**
 * Decide which STT command to use. Pure (env + existence injected) for testing.
 * Returns a command template; the audio file path is appended at call time.
 */
export function resolveSttCommand(
  env: NodeJS.ProcessEnv,
  fileExists: (p: string) => boolean = existsSync,
): string | null {
  if (env.MORNINGSTAR_STT_CMD) return env.MORNINGSTAR_STT_CMD;
  if (fileExists(OMNI_SCRIPT)) return `python3 ${OMNI_SCRIPT} --audio`;
  return null;
}

function extForMime(mime: string): string {
  if (mime.includes("ogg") || mime.includes("oga")) return "ogg";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("m4a") || mime.includes("mp4")) return "m4a";
  return "ogg";
}

/** Build a TranscribeFn that writes the audio to a temp file and runs `cmd <file>`. */
export function commandTranscriber(cmd: string, clock: () => number = Date.now): TranscribeFn {
  return async (audio: Buffer, mime: string): Promise<string> => {
    const file = join(tmpdir(), `morningstar-voice-${clock().toString(36)}.${extForMime(mime)}`);
    writeFileSync(file, audio);
    try {
      const parts = cmd.split(/\s+/);
      const out = execFileSync(parts[0], [...parts.slice(1), file], { encoding: "utf-8", timeout: 120000, maxBuffer: 1024 * 1024 * 5 });
      return out.trim();
    } finally {
      try { unlinkSync(file); } catch { /* ignore */ }
    }
  };
}

/** The transcriber resolved from the environment, or null if none configured. */
export function resolveTranscriber(): TranscribeFn | null {
  const cmd = resolveSttCommand(process.env);
  return cmd ? commandTranscriber(cmd) : null;
}
