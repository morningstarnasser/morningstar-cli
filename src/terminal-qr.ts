import QRCode from "qrcode";
/** Unstyled cells let Ink own ANSI boundaries, including padding and line clearing. */
export function qrRows(url: string): { top: boolean; bottom: boolean }[][] {
  const { modules } = QRCode.create(url, { errorCorrectionLevel: "M" });
  const dark = (x: number, y: number) => Boolean(x >= 0 && y >= 0 && x < modules.size && y < modules.size && modules.get(y, x));
  return Array.from({ length: Math.ceil((modules.size + 8) / 2) }, (_, row) =>
    Array.from({ length: modules.size + 8 }, (_, col) => ({ top: dark(col - 4, row * 2 - 4), bottom: dark(col - 4, row * 2 - 3) })));
}
/** Four-module quiet zone and explicit black/white colors survive dark themes. */
export function terminalQR(url: string): string {
  const { modules } = QRCode.create(url, { errorCorrectionLevel: "M" });
  const dark = (x: number, y: number) => x >= 0 && y >= 0 && x < modules.size && y < modules.size && modules.get(y, x);
  const lines: string[] = [];
  for (let y = -4; y < modules.size + 4; y += 2) {
    let line = "";
    for (let x = -4; x < modules.size + 4; x++) line += `\x1b[${dark(x, y) ? 30 : 97};${dark(x, y + 1) ? 40 : 107}m▀`;
    lines.push(line + "\x1b[0m");
  }
  return lines.join("\n");
}
