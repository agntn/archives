<script setup lang="ts">
import { PROVIDERS, PROVIDERS_IN_ALL } from "../../utils/providers";

const { targets, target, index, paused, current, content, diff, step } = useLandingArchive();
</script>

<template>
  <div class="archives-landing not-prose">
    <LandingHero
      :target="target"
      :sample="current"
      :position="index"
      :total="targets.length"
      @step="step"
      @pause="paused = $event"
    />

    <LandingFeature
      title="Read what the page said"
      to="/guide/content"
      link="Reading captures"
      :checks="[
        'Original bytes from raw replay endpoints, never the archive\'s own toolbar',
        'Transfer and content encodings, charset and markup to text handled',
        'A timestamp picks the closest capture, and the answer says which one it got',
      ]"
    >
      A list of captures says when a page existed. Reading one says what it contained. The same
      call works on Wayback, Arquivo.pt, Webarchiv Österreich, Vefsafn, OSZK Webarchívum,
      Archive-It and Common Crawl WARC ranges, and returns the decoded body with its real capture
      date.
      <template #visual>
        <LandingRead :sample="content" />
      </template>
    </LandingFeature>

    <LandingFeature
      title="Compare two captures"
      to="/guide/diff"
      link="Comparing versions"
      :checks="[
        'Visible text by default, decoded source with format=raw',
        'Both captures from one provider, so replay rewriting never looks like a change',
        'Bounded by time and edit distance, with a digest that pins the patch',
      ]"
      reverse
    >
      Two dates, one URL, one provider. The result is a unified diff with the exact capture dates
      it resolved to, plus a warning when either body was cut before comparison, so an absence is
      never claimed on half a page.
      <template #visual>
        <LandingDiff :diff="diff" />
      </template>
    </LandingFeature>

    <section class="archives-section">
      <div class="mx-auto w-full max-w-[var(--ui-container)] px-8 py-20 sm:px-12 lg:px-16">
        <div class="max-w-2xl">
          <h2 class="text-2xl font-medium tracking-tight text-highlighted sm:text-[1.75rem]">
            Every source, one shape
          </h2>
          <p class="mt-4 text-sm leading-6 text-muted">
            CDX, CDXJ, Memento TimeMaps, WARC byte ranges and a REST API behind a key. Each provider
            maps its index onto the shared response helpers, so a page from Arquivo.pt looks like a
            page from the Wayback Machine. Providers load lazily: a project that only asks one
            archive never ships the other {{ PROVIDERS.length - 1 }}.
            <code class="archives-code">providers.all()</code> asks the {{ PROVIDERS_IN_ALL.length }}
            that need nothing from you.
          </p>
          <p class="landing-entry">
            <span class="console-tag">Load</span>
            <code>createArchive(providers.wayback())</code>
          </p>
        </div>
        <ProviderRoster class="mt-10" />
      </div>
    </section>

    <LandingFeature
      title="Four tools over MCP"
      to="/guide/agents"
      link="MCP server and extensions"
      :checks="[
        'archives_snapshots, archives_content, archives_diff and archives_providers on every surface',
        'The text carries the whole answer: provider, dates, URLs and who could not answer',
        'Archived bodies are fenced as untrusted data, never as instructions',
      ]"
    >
      The MCP server, the Pi extension and the OMP extension call the same executors, so they
      answer identically. Slices, continuation arguments and digests let an agent page through a
      long body without reading it twice.
      <template #visual>
        <LandingToolCall :target="target" :sample="current" />
      </template>
    </LandingFeature>

    <LandingFeature
      title="Investigate the archive together"
      to="/guide/webmcp"
      link="WebMCP Evidence Room"
      :checks="[
        'Four browser tools run one investigation instead of copying the page controls',
        'Agent calls and manual actions update the same caseboard',
        'Findings stay separate from cited archive excerpts marked as untrusted',
      ]"
      reverse
    >
      The Evidence Room turns this site into a shared archive workspace. An agent scopes the
      question, finds comparable captures without reading every page, inspects one diff and leaves
      the finding for review. No WebMCP in your browser? The whole workflow still works by hand.
      <template #visual>
        <LandingEvidence />
      </template>
    </LandingFeature>

    <section class="archives-section">
      <div class="mx-auto w-full max-w-[var(--ui-container)] px-8 py-20 sm:px-12 lg:px-16">
        <LandingStart />
      </div>
    </section>
  </div>
</template>

<style scoped>
.landing-entry {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin: 20px 0 0;
  min-width: 0;
}
.landing-entry > .console-tag {
  flex: none;
  margin: 0;
}
.landing-entry > code {
  min-width: 0;
  overflow: hidden;
  font-family: var(--font-mono);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-text-highlighted);
}
</style>
