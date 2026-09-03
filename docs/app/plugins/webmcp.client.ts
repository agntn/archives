import { createEvidenceTools, EVIDENCE_TOOL_NAMES } from "../utils/webmcp";

/** Registers the archive investigation workflow when the browser exposes the experimental WebMCP API. */
export default defineNuxtPlugin(() => {
  const room = useEvidenceRoom();
  const modelContext = document.modelContext;
  if (!modelContext) {
    room.setWebMcp({
      availability: "unavailable",
      message: "WebMCP is not enabled in this browser. The Evidence Room still works by hand.",
      tools: [],
    });
    return;
  }

  const lifecycle = new AbortController();
  const registerTool = modelContext.registerTool.bind(modelContext);
  const tools = createEvidenceTools({
    scopeCase: room.scopeCase,
    findChanges: room.findChanges,
    inspectChange: room.inspectChange,
    pinFinding: room.pinFinding,
  });

  async function register() {
    try {
      await registerTool(tools[0], { signal: lifecycle.signal });
      await registerTool(tools[1], { signal: lifecycle.signal });
      await registerTool(tools[2], { signal: lifecycle.signal });
      await registerTool(tools[3], { signal: lifecycle.signal });
      room.setWebMcp({
        availability: "ready",
        message: "Four archive investigation tools are visible to this browser's agent.",
        tools: [...EVIDENCE_TOOL_NAMES],
      });
    } catch (error) {
      lifecycle.abort();
      room.setWebMcp({
        availability: "error",
        message:
          `WebMCP registration failed: ${error instanceof Error ? error.message : String(error)}`.slice(
            0,
            280,
          ),
        tools: [],
      });
    }
  }

  void register();
  useNuxtApp().vueApp.onUnmount(() => lifecycle.abort());
});
