// Shared helpers for the "深入分析" → native agents handoff.
//
// Instead of pasting the (possibly long) report into the chat input, we hand
// the full markdown over as a document: the native composer writes it into the
// chosen project's working dir (.awenops-reports/<file>.md) and the prompt
// asks the agent to Read it. See:
//   • AppContent.tsx               — reads `awenops-agent-handoff`
//   • useChatComposerState.ts      — uploads the doc + prefills the prompt

// Subfolder (under the project working dir) the report file is written to. A
// dotfolder keeps it out of the way / less likely to be committed by accident.
export const REPORTS_SUBDIR = ".awenops-reports";

export type ReportDoc = {
  filename: string; // e.g. luggage-2026-06-05T13-55-20.md
  relPath: string; // .awenops-reports/<filename> (relative to project cwd)
  content: string; // full markdown report
};

export type AgentHandoff = {
  provider: string; // agent id == native provider id (claude / hermes / …)
  prompt: string; // composer text; references `doc.relPath` when doc is set
  doc?: ReportDoc; // full report, uploaded into cwd by the composer
};

// Build a report-document descriptor with a deterministic, filesystem-safe name.
export function buildReportDoc(slug: string, content: string): ReportDoc {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const safe = (slug || "report").trim().replace(/[^\w.-]+/g, "_").slice(0, 40) || "report";
  const filename = `${safe}-${stamp}.md`;
  return { filename, relPath: `${REPORTS_SUBDIR}/${filename}`, content };
}

// The reference line that takes the place of the inline report inside a prompt.
// The agent is told to Read the attached file rather than receive pasted text.
export function reportReference(doc: ReportDoc): string {
  return (
    `（完整报告已作为文件随附到当前工作目录：\`./${doc.relPath}\`。` +
    `请先用 Read 工具读取该文件的全文，再据此完成下面的分析。）`
  );
}

// Stash the handoff for the native agents app and let the caller navigate.
export function writeAgentHandoff(handoff: AgentHandoff): void {
  sessionStorage.setItem("awenops-agent-handoff", JSON.stringify(handoff));
}
