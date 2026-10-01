# Design system

The shared rules (direction, color roles, type, the `console-*` grammar, hero, docs chrome, density, motion, checks) live in the one agntn design system document, kept with the agntn skills until it ships in the shared package. This file records only what archives owns and where it departs from the shared rules. It doesn't repeat them.

The instruments archives owns:

| Instrument | Where | Object |
| --- | --- | --- |
| [LandingHero.vue](app/components/content/LandingHero.vue) | landing, first screen | hero zone, circuit `snapshots()` into the timeline instrument |
| [LandingTimeline.vue](app/components/content/LandingTimeline.vue) | under the hero | one `snapshots(target)` over `providers.all()`: captures per year on one axis, the archives as cells |
| [ProviderCells.vue](app/components/ProviderCells.vue) | landing timeline | every archive in `providers.all()` as a cell, the node says answered, empty, cannot list or failed |
| [LandingRead.vue](app/components/content/LandingRead.vue) | "Read what the page said" | one `getContent` answer: the capture it resolved to, five lines of it, the tool text in a dialog |
| [LandingDiff.vue](app/components/content/LandingDiff.vue) | "Compare two captures" | one `archives_diff` answer: the two dates, six lines of the patch, the digest |
| [ProviderRoster.vue](app/components/content/ProviderRoster.vue) | landing and `/providers` | roster of the providers on `UTable`, sortable |
| [LandingToolCall.vue](app/components/content/LandingToolCall.vue) | "Four tools over MCP" | `archives_snapshots` for the walked target, its summary line and the recorded text |
| [LandingEvidence.vue](app/components/content/LandingEvidence.vue) | "Investigate the archive together" | the four WebMCP tools of the Evidence Room in the order a case runs |
| [LandingStart.vue](app/components/content/LandingStart.vue) | closing section | install, notes, first read as a file |
| [ProviderFacts.vue](app/components/content/ProviderFacts.vue) | every provider page | provider dossier: ID bar with position and host, reticle, index, bodies, `providers.all()`, operations, access |
| [ToolHero.vue](app/components/content/ToolHero.vue) | every explorer page | hero zone with the explorer's pages on its last line and the page's first instrument on the circuit |
| [ExplorerPanel.vue](app/components/ExplorerPanel.vue) | every explorer page | the shell of one explorer instrument: crosses, bar, ruler, bands, footer; `as="form"` for a form |
| [CaptureViewer.vue](app/components/content/CaptureViewer.vue) | timeline, compare, capture | one capture: replay, source or text as `UTabs`, the shelf, citation and permalink as controls |
| [CaptureStrip.vue](app/components/content/CaptureStrip.vue) | timeline, compare | captures as ticks on a time axis, the one in the viewer taller in the accent |
| [Landing.takumi.vue](app/components/OgImage/Landing.takumi.vue), [Docs.takumi.vue](app/components/OgImage/Docs.takumi.vue) | OG images | the hero zone in 1200 by 600; a docs page as one instrument with the four tools |

Provider names, icons, hosts, indexes and the roster sentence come from [providers.ts](app/utils/providers.ts). The landing samples come from [landing-fixtures.ts](app/utils/landing-fixtures.ts), recorded through the library, and the live answers replace them through [useLandingArchive.ts](app/composables/useLandingArchive.ts).

## Nuxt UI variants

The same mapping as web and registries, plus three controls archives needs:

| Component and variant | Look | Used for |
| --- | --- | --- |
| `UButton` primary solid, neutral outline | action segment, glyph in its own cell | search, load, trace, get started |
| `UButton` neutral subtle | boxed control, `square` for a step | open, view, copy, previous and next |
| `UButton` variant `chip` | chip, primary for the picked one | warm domains, diff format |
| `UBadge` neutral subtle, neutral outline, error outline | boxed mono word: bright, quiet, red | archive state (`ok`, `empty`, `unsupported`, `unreachable`, `failed`), finding relation |
| `UTabs` link | mono capitals over an accent segment | viewer mode, agent tool, export format |
| `UInput`, `USelectMenu`, `UTextarea` none | the readout row is the frame | every explorer field |
| `UCheckbox` | square box, the accent once picked | picking two captures to diff |
| `USlider` | 1px rail, square thumb | walking the pair on `/compare` |

## Anatomy

- **Landing timeline.** Bar `Call snapshots("<target>")` with the sample's position, meta `live` or `recorded`. Subject band: reticle with the history glyph, `Target / provider=all`, the target in mono, one sentence with the count; under it `Captures [ per year ]`, one column per year from 1996 to the year the sample was fetched, so every sample shares the axis. Readout: captures in the accent, span, newest, answered. Band `Archives` with the provider cells. Footer: the link into `/timeline` and previous and next.
- **Explorer page.** `ToolHero` zone (ID strip `explorer / <page>`, two-tone title, one sentence, the explorer's pages), then the page's instruments stacked on the circuit: the form first (`Call` with the library call in short form), then the answer (`List`, `Log`, `View`, `ID`), then the diff. Loading keeps the ruler cursor looping; a failure is a line with a red `Failed` tag inside the same shell.
- **Capture page.** A record page: the viewer on the circuit, then an `ID` dossier with the archive, index, status and digest in the readout, leads `Original`, `Snapshot`, `Cite`, the same capture as an MCP call and the `archives_snapshots` text in a dialog.
- **Evidence Room.** The four steps as cells (done filled, current on the accent, waiting hollow), then one instrument per step: the question form, the case dossier with coverage in the readout, candidate windows as rows, the inspected excerpt with the pin form, the findings.

## Motion

| Change | Motion |
| --- | --- |
| landing sample advances (3.6 s, paused on hover and focus) | ruler cursor once, scan and reticle arcs, year columns grow from the axis |
| a call in flight | ruler cursor loops (`console-cursor-busy`) on the instrument that waits |
| reduced motion | no walk; previous and next still work |

## Differences

Departures from the shared rules, recorded for the shared package:

- The landing's hero instrument is the timeline, not a form, so it hides below 48rem like the shared rule says; the explorer pages keep theirs (`hero-instrument-keep`) because it's the form.
- The capture strip draws its ticks as plain buttons: they are marks placed by date on an axis, not controls, and a `UButton` per capture can't sit at a computed position. Each tick has a `UTooltip` and an accessible name.
- Replay and source frames keep a white background: they show the archive's page as it was, not a surface of this site.
- The explorer nav is a row of the zone, mono capitals with the square node of the header's areas; nine pages as `UTabs` would read as a second navigation system.
- No data version exists, so ID strips and footers carry none. The version comes from the root `package.json`.
- The OG images ship local Figtree and Fira Code TTFs, the keys mechanism, like web.

## Checks

Beyond the shared checks: the landing at 1440, 1024, 390 and 320 px with the heights of the walked instruments through every sample and each against its text column; every explorer page at 390 and 320 px with no horizontal scroll, measured on elements; `/timeline` with a deep link that opens the viewer; `/providers` and one provider page.
