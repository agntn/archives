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

const state = reactive<{ loading: boolean; error?: string; text?: string; details?: unknown; ms?: number }>({ loading: false });
const showDetails = ref(false);
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

async function copy(kind: string, text: string) {
  try {
    await navigator.clipboard.writeText(text);
    copied.value = kind;
    setTimeout(() => {
      copied.value = undefined;
    }, 1200);
  } catch {
    // Clipboard blocked; the text is on screen.
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
    />

    <section class="archives-section">
      <div class="mx-auto w-full max-w-[var(--ui-container)] space-y-6 px-8 py-12 sm:px-12 lg:px-16">
        <div class="archives-frame overflow-hidden rounded-xl">
          <div class="flex flex-wrap gap-1 border-b border-muted px-4 py-3">
            <button v-for="(meta, id) in TOOLS" :key="id" type="button" class="archives-segment inline-flex items-center gap-1.5" :class="{ 'archives-segment-active': tool === id }" @click="tool = id">
              <span class="font-mono text-xs">{{ meta.name }}</span>
            </button>
          </div>
          <form class="grid gap-4 px-5 py-5 sm:grid-cols-2 lg:grid-cols-4" @submit.prevent="run">
            <p class="text-sm text-muted sm:col-span-2 lg:col-span-4">{{ TOOLS[tool].blurb }}</p>
            <template v-if="tool !== 'providers'">
              <label class="sm:col-span-2">
                <span class="archives-label">target</span>
                <input v-model="args.target" type="text" class="archives-field font-mono" autocomplete="off" spellcheck="false" />
              </label>
              <label>
                <span class="archives-label">provider</span>
                <select v-model="args.provider" class="archives-select">
                  <option value="all">all</option>
                  <option v-for="provider in PROVIDERS" :key="provider.slug" :value="provider.slug">{{ provider.slug }}</option>
                </select>
              </label>
            </template>
            <template v-if="tool === 'snapshots'">
              <label><span class="archives-label">limit</span><input v-model.number="args.limit" type="number" min="1" max="50" class="archives-field font-mono" /></label>
              <label><span class="archives-label">from</span><input v-model="args.from" type="text" class="archives-field font-mono" placeholder="2010" /></label>
              <label><span class="archives-label">to</span><input v-model="args.to" type="text" class="archives-field font-mono" placeholder="2020-06" /></label>
            </template>
            <template v-if="tool === 'content'">
              <label><span class="archives-label">timestamp</span><input v-model="args.timestamp" type="text" class="archives-field font-mono" placeholder="2015 or 20150601" /></label>
              <label><span class="archives-label">format</span><select v-model="args.format" class="archives-select"><option value="text">text</option><option value="raw">raw</option></select></label>
              <label><span class="archives-label">maxChars</span><input v-model.number="args.maxChars" type="number" min="100" max="200000" class="archives-field font-mono" /></label>
              <label><span class="archives-label">offset</span><input v-model.number="args.offset" type="number" min="0" class="archives-field font-mono" /></label>
            </template>
            <template v-if="tool === 'diff'">
              <label><span class="archives-label">before</span><input v-model="args.before" type="text" class="archives-field font-mono" /></label>
              <label><span class="archives-label">after</span><input v-model="args.after" type="text" class="archives-field font-mono" /></label>
              <label><span class="archives-label">format</span><select v-model="args.format" class="archives-select"><option value="text">text</option><option value="raw">raw</option></select></label>
              <label><span class="archives-label">context</span><input v-model.number="args.context" type="number" min="0" max="20" class="archives-field font-mono" /></label>
            </template>
            <div class="flex items-end sm:col-span-2 lg:col-span-4">
              <UButton type="submit" color="primary" :loading="state.loading" icon="i-lucide-terminal">Run {{ TOOLS[tool].name }}</UButton>
            </div>
          </form>
        </div>

        <div class="grid gap-4 lg:grid-cols-2">
          <div class="archives-frame overflow-hidden rounded-xl">
            <div class="flex items-center justify-between gap-2 border-b border-muted px-5 py-3">
              <p class="font-mono text-xs text-muted"><span class="text-dimmed">result · text</span><span v-if="state.ms" class="ms-2 text-dimmed">{{ (state.ms / 1000).toFixed(1) }} s</span></p>
              <button v-if="state.text" type="button" class="archives-btn h-7 px-2 text-xs" @click="copy('text', state.text!)">
                <UIcon :name="copied === 'text' ? 'i-lucide-check' : 'i-lucide-clipboard-copy'" class="size-3.5" />
                copy
              </button>
            </div>
            <p v-if="state.loading" class="flex items-center gap-2 px-5 py-4 text-sm text-muted"><UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />Running on the docs worker…</p>
            <pre v-else-if="state.error" class="archives-body" :style="{ color: 'var(--archives-del)' }">{{ state.error }}</pre>
            <pre v-else-if="state.text" class="archives-body">{{ state.text }}</pre>
            <p v-else class="px-5 py-4 text-sm text-muted">Nothing run yet.</p>
            <div v-if="state.details" class="border-t border-muted">
              <button type="button" class="flex w-full items-center justify-between px-5 py-2.5 font-mono text-[11px] text-dimmed hover:text-highlighted" @click="showDetails = !showDetails">
                <span>details · what Pi and OMP render beside the text</span>
                <UIcon :name="showDetails ? 'i-lucide-chevron-left' : 'i-lucide-chevron-right'" class="size-3.5" />
              </button>
              <pre v-if="showDetails" class="archives-body max-h-96">{{ JSON.stringify(state.details, null, 2) }}</pre>
            </div>
          </div>

          <div class="space-y-4">
            <div class="archives-frame overflow-hidden rounded-xl">
              <div class="flex items-center justify-between gap-2 border-b border-muted px-5 py-3">
                <p class="font-mono text-xs text-muted"><span class="text-dimmed">MCP</span><span class="ms-2 text-highlighted">tools/call</span></p>
                <button type="button" class="archives-btn h-7 px-2 text-xs" @click="copy('mcp', mcpCall)">
                  <UIcon :name="copied === 'mcp' ? 'i-lucide-check' : 'i-lucide-clipboard-copy'" class="size-3.5" />
                  copy
                </button>
              </div>
              <CodeSnippet :code="mcpCall" lang="json" />
            </div>
            <div class="archives-frame overflow-hidden rounded-xl">
              <div class="flex items-center justify-between gap-2 border-b border-muted px-5 py-3">
                <p class="font-mono text-xs text-muted"><span class="text-dimmed">TypeScript</span><span class="ms-2 text-highlighted">@agntn/archives</span></p>
                <button type="button" class="archives-btn h-7 px-2 text-xs" @click="copy('ts', tsSnippet)">
                  <UIcon :name="copied === 'ts' ? 'i-lucide-check' : 'i-lucide-clipboard-copy'" class="size-3.5" />
                  copy
                </button>
              </div>
              <CodeSnippet :code="tsSnippet" :lang="tool === 'providers' ? 'shell' : 'ts'" />
            </div>
            <div class="archives-frame overflow-hidden rounded-xl">
              <div class="flex items-center justify-between gap-2 border-b border-muted px-5 py-3">
                <p class="font-mono text-xs text-muted"><span class="text-dimmed">client config</span><span class="ms-2 text-highlighted">archives mcp</span></p>
                <button type="button" class="archives-btn h-7 px-2 text-xs" @click="copy('cfg', mcpConfig)">
                  <UIcon :name="copied === 'cfg' ? 'i-lucide-check' : 'i-lucide-clipboard-copy'" class="size-3.5" />
                  copy
                </button>
              </div>
              <CodeSnippet :code="mcpConfig" lang="json" />
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
