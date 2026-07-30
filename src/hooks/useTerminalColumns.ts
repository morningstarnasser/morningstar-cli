import { useEffect, useState } from "react";
import { useStdout } from "ink";
import { normalizeTerminalColumns } from "../tui-layout.js";

export function useTerminalColumns(): number {
  const { stdout } = useStdout();
  const [columns, setColumns] = useState(() => normalizeTerminalColumns(stdout?.columns));

  useEffect(() => {
    if (!stdout) return;

    const update = () => setColumns(normalizeTerminalColumns(stdout.columns));
    update();
    stdout.on("resize", update);
    return () => {
      stdout.off("resize", update);
    };
  }, [stdout]);

  return columns;
}
