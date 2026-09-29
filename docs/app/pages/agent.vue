<script setup lang="ts">
import { errorText } from "../utils/capture";
import { PROVIDERS } from "../utils/providers";

definePageMeta({ layout: "default" });
useSeoMeta({
  title: "Agent console · @agntn/archives",
  description: "Run the four archive tools exactly as an MCP client would, and copy the call.",
});

const route = useRoute();

type Tool = "snapshots" | "content" | "diff" | "providers";

const TOOLS: Record<Tool, { name: string; title: string; blurb: string }> = {
  snapshots: { name: "archives_snapshots", title: "Snapshots", blurb: "List captures for a domain or URL." },
  content: { name: "archives_content", title: "Content", blurb: "Read one archived body, as text or raw markup." },
  diff: { name: "archives_diff", title: "Diff", blurb: "Compare two captures from one provider." },
  providers: { name: "archives_providers", title: "Providers", blurb: "Which providers exist and what they need." },
};

const tool = ref<Tool>("snapshots");
const args = reactive({
  target: "example.com",
  provider: "all",
  limit: 10,
  from: "",
  to: "",
  timestamp: "",
  format: "text",
  maxChars: 4000,
  offset: 0,
  before: "2024",
  after: "2026",
  context: 3,
});

/** The four tools as tabs, in the order the MCP server lists them. */
const TOOL_ICONS: Record<Tool, string> = {
  snapshots: "i-lucide-history",
  content: "i-lucide-file-text",
  diff: "i-lucide-git-compare",
  providers: "i-lucide-library",
};
const toolItems = (Object.keys(TOOLS) as Tool[]).map((id) => ({ label: TOOLS[id].title, value: id, icon: TOOL_ICONS[id] }));
const position = computed(() => (Object.keys(TOOLS) as Tool[]).indexOf(tool.value) + 1);
const providerItems = [
  { label: "all", value: "all", icon: "i-lucide-layers" },
  ...PROVIDERS.map((provider) => ({ label: provider.slug, value: provider.slug, icon: provider.icon })),
];
const pickedProvider = computed(() => providerItems.find((item) => item.value === args.provider));
const formatItems = [
  { label: "text", value: "text" },
  { label: "raw", value: "raw" },
];

const state = reactive<{ loading: boolean; error?: string; text?: string; details?: unknown; ms?: number }>({ loading: false });
const copied = ref<string | undefined>();

/** Only the arguments the chosen tool takes, without the empty ones. */
const toolArguments = computed<Record<string, unknown>>(() => {
  const clean = (entries: Array<[string, unknown]>) =>
    Object.fromEntries(entries.filter(([, value]) => value !== "" && value !== undefined && value !== null));
  switch (tool.value) {
    case "snapshots":
      return clean([["target", args.target], ["provider", args.provider], ["limit", args.limit], ["from", args.from], ["to", args.to]]);
    case "content":
      return clean([
        ["target", args.target],
        ["provider", args.provider],
        ["timestamp", args.timestamp],
        ["format", args.format],
        ["maxChars", args.maxChars],
        ["offset", args.offset || undefined],
      ]);
    case "diff":
      return clean([
        ["target", args.target],
        ["provider", args.provider],
        ["before", args.before],
        ["after", args.after],
        ["format", args.format],
        ["context", args.context],
        ["maxChars", args.maxChars],
      ]);
    default:
      return {};
  }
});

const mcpCall = computed(() =>
  JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: TOOLS[tool.value].name, arguments: toolArguments.value } }, null, 2),
);

const tsSnippet = computed(() => {
  const provider = args.provider === "all" || args.provider === "auto" ? "providers.all()" : `providers.${args.provider}()`;
  const target = JSON.stringify(args.target);
  switch (tool.value) {
    case "snapshots": {
      const options: string[] = [`limit: ${args.limit}`];
      if (args.from) options.push(`from: ${JSON.stringify(args.from)}`);
      if (args.to) options.push(`to: ${JSON.stringify(args.to)}`);
      return `import { createArchive, providers } from "@agntn/archives";

const archive = createArchive(${provider});
const response = await archive.snapshots(${target}, { ${options.join(", ")} });
response.pages; // newest first`;
    }
    case "content":
      return `import { createArchive, providers } from "@agntn/archives";

const archive = createArchive(${provider});
const capture = await archive.getContent(${target}${args.timestamp ? `, { timestamp: ${JSON.stringify(args.timestamp)} }` : ""});
capture.timestamp; // the capture it actually found
capture.content;`;
    case "diff":
      return `import { createArchive, diffArchivedContent, providers } from "@agntn/archives";

const archive = createArchive(${provider});
const before = await archive.getContent(${target}, { timestamp: ${JSON.stringify(args.before)} });
const after = await archive.getContent(${target}, { timestamp: ${JSON.stringify(args.after)} });
const diff = diffArchivedContent(before, after${args.format === "raw" ? ', { format: "raw" }' : ""});
diff.patch;`;
    default:
      return `archives mcp  # then call archives_providers from the client`;
  }
});

const mcpConfig = `{
  "mcpServers": {
    "archives": { "command": "npx", "args": ["-y", "@agntn/archives", "mcp"] }
  }
}`;

async function run() {
  state.loading = true;
  state.error = undefined;
  state.text = undefined;
  state.details = undefined;
  const started = Date.now();
  try {
    const answer = await $fetch<{ text: string; details: unknown }>(`/api/${tool.value}`, { retry: 0, query: toolArguments.value });
    state.text = answer.text;
    state.details = answer.details;
  } catch (error) {
    state.error = errorText(error);
  } finally {
    state.ms = Date.now() - started;
    state.loading = false;
  }
}

/** Copies a snippet; a blocked clipboard is not an error, the text is on screen anyway. */
async function copy(kind: string, text: string) {
  try {
    await navigator.clipboard.writeText(text);
    copied.value = kind;
    setTimeout(() => {
      copied.value = undefined;
    }, 1200);
  } catch {
    return;
  }
}

let bootstrapped = false;
onMounted(() => {
  watch(
    () => route.query,
    (query) => {
      if (bootstrapped) {
        return;
      }
      const read = (key: string) => (typeof query[key] === "string" ? (query[key] as string) : "");
      if (!read("tool") && !read("target")) {
        return;
      }
      bootstrapped = true;
      const requested = read("tool");
      if (requested in TOOLS) {
        tool.value = requested as Tool;
      }
      if (read("target")) args.target = read("target");
      if (read("provider")) args.provider = read("provider");
      if (read("timestamp")) args.timestamp = read("timestamp");
      if (read("before")) args.before = read("before");
      if (read("after")) args.after = read("after");
      void run();
    },
    { immediate: true, deep: true },
  );
});
</script>

<template>
  <div class="archives-landing not-prose">
    <ToolHero
      eyebrow="agent console"
      title="The four tools,"
      accent="as an agent sees them."
      description="Fill the arguments, run the executor, read the exact text an MCP client receives. Copy the call as JSON-RPC or as the TypeScript that does the same."
      circuit="call"
    >
      <template #instrument>
        <div class="agent-stack">
          <ExplorerPanel
            as="form"
            tag="Call"
            label="Request"
            :busy="state.loading"
            :meta="TOOLS[tool].blurb"
            @submit.prevent="run"
          >
            <template #title>{{ TOOLS[tool].name }}<span class="console-file">{{ String(position).padStart(2, "0") }} / {{ String(toolItems.length).padStart(2, "0") }}</span></template>

            <UTabs v-model="tool" :items="toolItems" :content="false" variant="link" class="agent-tabs" aria-label="Tool" />

            <div class="archives-band agent-request">
              <div class="agent-glyph" aria-hidden="true">
                <ConsoleReticle :key="tool" :icon="TOOL_ICONS[tool]" />
              </div>
              <div class="agent-fields">
                <div class="console-readout">
                  <dl class="console-readout-rows">
                    <template v-if="tool !== 'providers'">
                      <div>
                        <dt><label for="agent-target">target</label></dt>
                        <dd><UInput id="agent-target" v-model="args.target" variant="none" autocomplete="off" spellcheck="false" class="w-full" /></dd>
                      </div>
                      <div>
                        <dt>provider</dt>
                        <dd>
                          <USelectMenu v-model="args.provider" :items="providerItems" value-key="value" :icon="pickedProvider?.icon" variant="none" :search-input="false" aria-label="Provider" class="w-full" />
                        </dd>
                      </div>
                    </template>
                    <template v-if="tool === 'snapshots'">
                      <div>
                        <dt><label for="agent-limit">limit</label></dt>
                        <dd><UInput id="agent-limit" v-model.number="args.limit" type="number" :min="1" :max="50" variant="none" class="w-full" /></dd>
                      </div>
                      <div>
                        <dt><label for="agent-from">from · to</label></dt>
                        <dd class="agent-pair">
                          <UInput id="agent-from" v-model="args.from" variant="none" placeholder="2010" aria-label="From" />
                          <span class="archives-dim" aria-hidden="true">→</span>
                          <UInput v-model="args.to" variant="none" placeholder="2020-06" aria-label="To" />
                        </dd>
                      </div>
                    </template>
                    <template v-if="tool === 'content'">
                      <div>
                        <dt><label for="agent-timestamp">timestamp</label></dt>
                        <dd><UInput id="agent-timestamp" v-model="args.timestamp" variant="none" placeholder="2015 or 20150601" class="w-full" /></dd>
                      </div>
                      <div>
                        <dt>format</dt>
                        <dd><USelectMenu v-model="args.format" :items="formatItems" value-key="value" variant="none" :search-input="false" aria-label="Format" class="w-full" /></dd>
                      </div>
                      <div>
                        <dt><label for="agent-max">maxChars · offset</label></dt>
                        <dd class="agent-pair">
                          <UInput id="agent-max" v-model.number="args.maxChars" type="number" :min="100" :max="200000" variant="none" aria-label="maxChars" />
                          <span class="archives-dim" aria-hidden="true">·</span>
                          <UInput v-model.number="args.offset" type="number" :min="0" variant="none" aria-label="offset" />
                        </dd>
                      </div>
                    </template>
                    <template v-if="tool === 'diff'">
                      <div>
                        <dt><label for="agent-before">before · after</label></dt>
                        <dd class="agent-pair">
                          <UInput id="agent-before" v-model="args.before" variant="none" aria-label="before" />
                          <span class="archives-dim" aria-hidden="true">→</span>
                          <UInput v-model="args.after" variant="none" aria-label="after" />
                        </dd>
                      </div>
                      <div>
                        <dt>format</dt>
                        <dd><USelectMenu v-model="args.format" :items="formatItems" value-key="value" variant="none" :search-input="false" aria-label="Format" class="w-full" /></dd>
                      </div>
                      <div>
                        <dt><label for="agent-context">context</label></dt>
                        <dd><UInput id="agent-context" v-model.number="args.context" type="number" :min="0" :max="20" variant="none" class="w-full" /></dd>
                      </div>
                    </template>
                    <template v-if="tool === 'providers'">
                      <div>
                        <dt>arguments</dt>
                        <dd class="archives-dim">none: every provider, what it needs, and whether Perma.cc has a key</dd>
                      </div>
                    </template>
                  </dl>
                </div>
                <div>
                  <UButton type="submit" color="primary" variant="solid" :loading="state.loading" trailing-icon="i-lucide-terminal" :label="`Run ${TOOLS[tool].name}`" />
                </div>
              </div>
            </div>

            <div class="archives-band agent-calls">
              <div class="agent-call">
                <p class="console-label console-rule-title">
                  <span>MCP <span aria-hidden="true">[ tools/call ]</span></span>
                  <span class="console-mark" aria-hidden="true" />
                  <UButton color="neutral" variant="subtle" :icon="copied === 'mcp' ? 'i-lucide-check' : 'i-lucide-copy'" :label="copied === 'mcp' ? 'copied' : 'copy'" aria-label="Copy the MCP call" @click="copy('mcp', mcpCall)" />
                </p>
                <CodeSnippet :code="mcpCall" lang="json" />
              </div>
              <div class="agent-call">
                <p class="console-label console-rule-title">
                  <span>TypeScript <span aria-hidden="true">[ @agntn/archives ]</span></span>
                  <span class="console-mark" aria-hidden="true" />
                  <UButton color="neutral" variant="subtle" :icon="copied === 'ts' ? 'i-lucide-check' : 'i-lucide-copy'" :label="copied === 'ts' ? 'copied' : 'copy'" aria-label="Copy the TypeScript" @click="copy('ts', tsSnippet)" />
                </p>
                <CodeSnippet :code="tsSnippet" :lang="tool === 'providers' ? 'shell' : 'ts'" />
              </div>
            </div>

            <div class="archives-band">
              <p class="console-label console-rule-title">
                <span>Client <span aria-hidden="true">[ archives mcp over stdio ]</span></span>
                <span class="console-mark" aria-hidden="true" />
                <UButton color="neutral" variant="subtle" :icon="copied === 'cfg' ? 'i-lucide-check' : 'i-lucide-copy'" :label="copied === 'cfg' ? 'copied' : 'copy'" aria-label="Copy the client config" @click="copy('cfg', mcpConfig)" />
              </p>
              <CodeSnippet :code="mcpConfig" lang="json" />
            </div>
          </ExplorerPanel>

          <ExplorerPanel
            tag="Answer"
            label="Response"
            :busy="state.loading"
            :sweep="state.text"
            :meta="state.ms ? `${(state.ms / 1000).toFixed(1)} s` : 'nothing run yet'"
          >
            <template #title>content[0].text</template>
            <div v-if="state.loading" class="archives-band">
              <p class="archives-note">
                <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" aria-hidden="true" />
                Running on the docs worker…
              </p>
            </div>
            <div v-else-if="state.error" class="archives-band">
              <p class="archives-error" role="alert"><span class="console-tag">Failed</span>{{ state.error }}</p>
            </div>
            <div v-else-if="state.text" class="archives-band">
              <p class="console-label console-rule-title">
                <span>Text <span aria-hidden="true">[ what the MCP client receives ]</span></span>
                <span class="console-mark" aria-hidden="true" />
                <UButton color="neutral" variant="subtle" :icon="copied === 'text' ? 'i-lucide-check' : 'i-lucide-copy'" :label="copied === 'text' ? 'copied' : 'copy'" aria-label="Copy the text" @click="copy('text', state.text!)" />
              </p>
              <!-- The tool text: interpolated into a pre, never rendered as markup. -->
              <pre class="agent-text">{{ state.text }}</pre>
            </div>
            <div v-else class="archives-band">
              <p class="archives-note">Nothing run yet. Pick a tool and press run.</p>
            </div>
            <ConsoleResponse
              v-if="state.details"
              :title="`${TOOLS[tool].name} details`"
              :text="JSON.stringify(state.details, null, 2)"
              label="Details"
              source="details"
              description="What Pi and OMP render beside the text. An MCP client never sees it."
            />
            <template #footer>
              <span>MCP · Pi · OMP answer from the same executor</span>
              <span class="console-meta">answered by the docs worker</span>
            </template>
          </ExplorerPanel>
        </div>
      </template>
    </ToolHero>
  </div>
</template>

<style scoped>
.agent-stack {
  display: grid;
  gap: 28px;
}
.agent-stack > :deep(.explorer-panel + .explorer-panel) {
  margin-top: 0;
}
.agent-tabs {
  padding: 0 20px;
}
.agent-request {
  display: grid;
  grid-template-columns: 84px minmax(0, 1fr);
  gap: 18px;
  align-items: start;
  border-top: 1px solid var(--console-line);
}
.agent-glyph {
  width: 84px;
}
.agent-fields {
  display: grid;
  gap: 16px;
  min-width: 0;
}
.agent-fields .console-readout-rows > div {
  grid-template-columns: 9rem minmax(0, 1fr);
}
.agent-fields .console-readout-rows dt {
  text-transform: none;
  letter-spacing: 0.02em;
}
.agent-pair {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 10px;
}
.agent-calls {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 20px 28px;
}
.agent-call {
  min-width: 0;
}
.agent-text {
  max-height: min(60dvh, 36rem);
  margin: 0;
  overflow: auto;
  overscroll-behavior: contain;
  font-family: var(--font-mono);
  font-size: 12.5px;
  line-height: 1.7;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--ui-text-muted);
}
@media (width < 56rem) {
  .agent-calls {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (width < 640px) {
  .agent-tabs {
    padding: 0 14px;
    overflow-x: auto;
  }
  .agent-tabs :deep([data-slot="leadingIcon"]) {
    display: none;
  }
  .agent-request {
    grid-template-columns: minmax(0, 1fr);
  }
  .agent-glyph {
    display: none;
  }
  .agent-fields .console-readout-rows > div {
    grid-template-columns: 6rem minmax(0, 1fr);
  }
}
</style>
