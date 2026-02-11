import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../hooks/useTheme.js";
import { getAllAgents, isBuiltinAgent } from "../custom-agents.js";
import { listThemes } from "../theme.js";

export function Features() {
  const { primary, info, dim, secondary, success } = useTheme();
  const allAgents = getAllAgents();
  const themes = listThemes();

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={info} bold>  {title}</Text>
      {children}
    </Box>
  );

  const Item = ({ text }: { text: string }) => (
    <Text color={dim}>  - {text}</Text>
  );

  const ToolItem = ({ name, desc }: { name: string; desc: string }) => (
    <Text>  <Text>{name.padEnd(9)}</Text> <Text color={dim}>{desc}</Text></Text>
  );

  return (
    <Box flexDirection="column" marginLeft={2} marginY={1}>
      <Text color={primary} bold>{"\n"}  * Morningstar AI — Alle Features{"\n"}</Text>

      <Section title="Multi-Provider AI">
        <Item text="DeepSeek R1 (Reasoning) + Chat" />
        <Item text="OpenAI GPT-4o, o1, o3-mini" />
        <Item text="Anthropic Claude Sonnet/Opus/Haiku" />
        <Item text="Google Gemini 2.0 Flash/Pro" />
        <Item text="Ollama (lokale Modelle)" />
        <Item text="Groq (Llama, Mixtral)" />
        <Item text="OpenRouter (alle Modelle)" />
        <Item text="Streaming + Plan-Modus + Multi-Turn (5 Runden)" />
      </Section>

      <Section title="Tools (12 verfuegbar)">
        <ToolItem name="read" desc="Dateien lesen mit Zeilennummern" />
        <ToolItem name="write" desc="Dateien schreiben/erstellen (mit Undo)" />
        <ToolItem name="edit" desc="Text ersetzen (mit Undo)" />
        <ToolItem name="delete" desc="Dateien loeschen (mit Undo)" />
        <ToolItem name="bash" desc="Shell-Befehle ausfuehren" />
        <ToolItem name="grep" desc="In Dateien suchen" />
        <ToolItem name="glob" desc="Dateien nach Pattern finden" />
        <ToolItem name="ls" desc="Verzeichnis auflisten" />
        <ToolItem name="git" desc="Git Status + Commits" />
        <ToolItem name="web" desc="Web-Suche (DuckDuckGo)" />
        <ToolItem name="fetch" desc="URL abrufen und lesen" />
        <ToolItem name="gh" desc="GitHub CLI Befehle" />
      </Section>

      <Section title="Agenten">
        {Object.entries(allAgents).map(([id, a]) => (
          <Text key={id}>
            {"  "}<Text color={a.color}>/agent:{id.padEnd(12)}</Text>
            {isBuiltinAgent(id) ? <Text color={dim}>[built-in]</Text> : <Text color={secondary}>[custom]</Text>}
            {" "}<Text color={dim}>{a.description}</Text>
          </Text>
        ))}
      </Section>

      <Section title="Custom Agent System">
        <Item text="Eigene Agenten erstellen, bearbeiten, loeschen" />
        <Item text="Export/Import als JSON zum Teilen" />
        <Item text="Persistent in ~/.morningstar/agents.json" />
      </Section>

      <Section title="Memory System">
        <Item text="Notizen persistent speichern (/memory add)" />
        <Item text="Werden automatisch in AI-Kontext injiziert" />
        <Item text="Durchsuchbar (/memory search)" />
      </Section>

      <Section title="Git Integration">
        <Item text="/diff, /diff staged, /commit, /log, /branch, /status" />
        <Item text="Smart Commit analysiert Aenderungen" />
      </Section>

      <Section title="Undo System">
        <Item text="Jede Dateiaenderung wird getrackt" />
        <Item text="/undo macht letzte Aenderung rueckgaengig" />
      </Section>

      <Section title="Themes">
        <Item text={themes.map((t) => t.name + (t.active ? " *" : "")).join(", ")} />
      </Section>

      <Section title="Codebase-Analyse">
        <Item text="/onboard — Projekt-Onboarding" />
        <Item text="/score — Qualitaetsscore" />
        <Item text="/roast — Humorvolle Code-Review" />
        <Item text="/map — Codebase Map" />
      </Section>

      <Section title="Vision & Image Generation">
        <Item text="Lokale Bild-Analyse mit Ollama" />
        <Item text="Lokale Bild-Erstellung mit Stable Diffusion" />
      </Section>

      <Section title="API Server">
        <Item text="Selbst-gehosteter HTTP Server (/serve)" />
        <Item text="OpenAI-kompatible Chat Completions API" />
      </Section>

      <Section title="Permission System">
        <Item text="auto — alle Tools ohne Nachfrage" />
        <Item text="ask — bei write/edit/delete nachfragen" />
        <Item text="strict — bei jedem Tool nachfragen" />
      </Section>

      <Section title="Cost Tracking">
        <Item text="Token-Schaetzung pro Message" />
        <Item text="Kostenberechnung per Model (USD)" />
      </Section>
    </Box>
  );
}
