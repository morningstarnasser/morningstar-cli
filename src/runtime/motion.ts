export function motionEnabled(env = process.env, tty = Boolean(process.stdout.isTTY)): boolean {
  return tty && !env.CI && env.TERM !== "dumb" && env.NO_COLOR === undefined && env.MORNINGSTAR_REDUCED_MOTION !== "1";
}
export const STARTUP_FRAMES = 12;
export const STARTUP_FRAME_MS = 60;
