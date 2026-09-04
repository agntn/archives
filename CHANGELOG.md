# Changelog

## v0.5.4

[compare changes](https://github.com/agntn/archives/compare/v0.5.3...v0.5.4)

### 🚀 Enhancements

- Add archived content pagination ([#65](https://github.com/agntn/archives/pull/65))
- Compare archived captures ([#68](https://github.com/agntn/archives/pull/68))
- **docs:** Explorer site on Cloudflare Workers ([#69](https://github.com/agntn/archives/pull/69))
- **docs:** Investigate archives with WebMCP ([#71](https://github.com/agntn/archives/pull/71))

### 🩹 Fixes

- Keep query URLs distinct in content cache ([#67](https://github.com/agntn/archives/pull/67))
- **docs:** Give Wayback listings time to answer ([#70](https://github.com/agntn/archives/pull/70))

### ❤️ Contributors

- Ori ([@oritwoen](https://github.com/oritwoen))
- Aeitwoen ([@aeitwoen](https://github.com/aeitwoen))

## v0.5.3

[compare changes](https://github.com/agntn/archives/compare/v0.5.2...v0.5.3)

### 🚀 Enhancements

- Add Arquivo.pt provider ([#62](https://github.com/agntn/archives/pull/62))
- Add Webarchiv Österreich provider ([#63](https://github.com/agntn/archives/pull/63))

### ❤️ Contributors

- Ori ([@oritwoen](https://github.com/oritwoen))

## v0.5.2

[compare changes](https://github.com/agntn/archives/compare/v0.5.1...v0.5.2)

### 🩹 Fixes

- Deduplicate concurrent provider loads ([#51](https://github.com/agntn/archives/pull/51))
- Avoid wildcarding exact archive URLs ([#53](https://github.com/agntn/archives/pull/53))
- Remove the fake Common Crawl latest index ([#56](https://github.com/agntn/archives/pull/56))
- Preserve Archive.today capture URLs ([#57](https://github.com/agntn/archives/pull/57))
- Don't drop providers added during resolution ([#58](https://github.com/agntn/archives/pull/58))
- Reject enum values outside tool schemas ([#59](https://github.com/agntn/archives/pull/59))
- Stop promising raw archive bytes ([#60](https://github.com/agntn/archives/pull/60))
- Restore provider labels on archive results ([#61](https://github.com/agntn/archives/pull/61))

### 💅 Refactors

- Make shared Ox checks real ([#55](https://github.com/agntn/archives/pull/55))

### ❤️ Contributors

- Aeitwoen <aeitwoen@gmail.com>
- Ori ([@oritwoen](https://github.com/oritwoen))

## v0.5.1

[compare changes](https://github.com/agntn/archives/compare/v0.5.0...v0.5.1)

### 🚀 Enhancements

- Add native OMP extension ([#25](https://github.com/agntn/archives/pull/25))
- Add Archive-It provider ([#26](https://github.com/agntn/archives/pull/26))
- Serve archives over MCP ([#28](https://github.com/agntn/archives/pull/28))
- Read archived page content ([#29](https://github.com/agntn/archives/pull/29))
- Add Conifer provider ([#27](https://github.com/agntn/archives/pull/27))
- Filter snapshot listings by time window ([#33](https://github.com/agntn/archives/pull/33))
- Fetch Archive.today capture bodies ([#42](https://github.com/agntn/archives/pull/42))
- Search Memento archives through MemGator ([#46](https://github.com/agntn/archives/pull/46))
- Keep numeric limits visible to agents ([#49](https://github.com/agntn/archives/pull/49))
- Clarify snapshot discovery routing ([#50](https://github.com/agntn/archives/pull/50))

### 🔥 Performance

- Build the OMP schemas from the host TypeBox ([#37](https://github.com/agntn/archives/pull/37))
- Stop resolving typebox at every spawn ([#43](https://github.com/agntn/archives/pull/43))

### 🩹 Fixes

- Cancel archive requests with tool calls ([#30](https://github.com/agntn/archives/pull/30))
- Fall back to snapshot stamp for unreadable memento dates ([#31](https://github.com/agntn/archives/pull/31))
- Forward the cancellation signal to Conifer searches ([#32](https://github.com/agntn/archives/pull/32))
- Keep the OMP loader imports literal ([#34](https://github.com/agntn/archives/pull/34))
- Build before type-checking the extensions ([#36](https://github.com/agntn/archives/pull/36))
- List the newest Archive.today capture ([#39](https://github.com/agntn/archives/pull/39))
- Treat the Common Crawl no-captures 404 as empty ([#41](https://github.com/agntn/archives/pull/41))

### 🤖 CI

- Publish tagged releases through OIDC ([#48](https://github.com/agntn/archives/pull/48))

### ❤️ Contributors

- Ori ([@oritwoen](https://github.com/oritwoen))
- Aeitwoen <aeitwoen@gmail.com>

## v0.5.0

[compare changes](https://github.com/agntn/archives/compare/v0.4.0...v0.5.0)

### 🚀 Enhancements

- Add Pi extension ([#17](https://github.com/agntn/archives/pull/17))

### 🩹 Fixes

- Parallel result ordering ([#2](https://github.com/agntn/archives/pull/2))
- **archive-today:** Respect user options ([#4](https://github.com/agntn/archives/pull/4))
- **providers:** Move mergeOptions inside try/catch ([#15](https://github.com/agntn/archives/pull/15))
- Make CDX timestamp parsing deterministic for malformed input ([#14](https://github.com/agntn/archives/pull/14))
- Honor cache ttl ([c6b7ba9](https://github.com/agntn/archives/commit/c6b7ba9))
- Include provider cache key parts ([a099413](https://github.com/agntn/archives/commit/a099413))
- Align provider options with behavior ([a41ae49](https://github.com/agntn/archives/commit/a41ae49))
- Separate Wayback cache entries ([#19](https://github.com/agntn/archives/pull/19))
- Deduplicate multi-provider results ([#20](https://github.com/agntn/archives/pull/20))
- Respect resolveConfig options ([#21](https://github.com/agntn/archives/pull/21))
- Use authenticated Perma.cc URL lookup ([#23](https://github.com/agntn/archives/pull/23))

### 💅 Refactors

- **types:** Remove unused exported types ([d8089d0](https://github.com/agntn/archives/commit/d8089d0))
- **providers:** Drop noise comments ([e1bdeca](https://github.com/agntn/archives/commit/e1bdeca))
- **types:** Replace as any/as unknown as with proper types ([02c19af](https://github.com/agntn/archives/commit/02c19af))
- Surface unsupported provider operations end-to-end ([968f191](https://github.com/agntn/archives/commit/968f191))
- Use classes ([#18](https://github.com/agntn/archives/pull/18))
- ⚠️ Rename package to @agntn/archives ([#24](https://github.com/agntn/archives/pull/24))

### 🏡 Chore

- Update README.md ([7604dd1](https://github.com/agntn/archives/commit/7604dd1))
- Add CODEOWNERS ([05b9634](https://github.com/agntn/archives/commit/05b9634))
- Add LICENSE ([6e40870](https://github.com/agntn/archives/commit/6e40870))
- Add AGENTS.md ([32dd946](https://github.com/agntn/archives/commit/32dd946))
- Add oxlint, oxfmt, and editorconfig ([#12](https://github.com/agntn/archives/pull/12))
- Update typescript ([5e88ceb](https://github.com/agntn/archives/commit/5e88ceb))
- Update vitest ([936b25d](https://github.com/agntn/archives/commit/936b25d))
- Remove eslint ([9649652](https://github.com/agntn/archives/commit/9649652))
- Update remaining dependencies ([114a024](https://github.com/agntn/archives/commit/114a024))
- Update dependencies ([#22](https://github.com/agntn/archives/pull/22))

### ✅ Tests

- Cover provider fetch failures ([e7980f3](https://github.com/agntn/archives/commit/e7980f3))

### 🤖 CI

- Build playground in workflow ([9b89bde](https://github.com/agntn/archives/commit/9b89bde))

#### ⚠️ Breaking Changes

- ⚠️ Rename package to @agntn/archives ([#24](https://github.com/agntn/archives/pull/24))

### ❤️ Contributors

- Ori ([@oritwoen](https://github.com/oritwoen))
- Oritwoen ([@oritwoen](https://github.com/oritwoen))
- Aeitwoen <aeitwoen@gmail.com>

## v0.4.0

[compare changes](https://github.com/oritwoen/omnichron/compare/v0.3.1...v0.4.0)

### 🩹 Fixes

- **utils:** Fix concurrency control losing pending promises ([09139be](https://github.com/oritwoen/omnichron/commit/09139be))
- **storage:** Implement selective provider cache clearing ([df3b397](https://github.com/oritwoen/omnichron/commit/df3b397))

### 💅 Refactors

- ⚠️ Rename `getSnapshots` to `snapshots` across the codebase for consistency ([ebe318c](https://github.com/oritwoen/omnichron/commit/ebe318c))
- Improve type safety across codebase ([e5ff2b1](https://github.com/oritwoen/omnichron/commit/e5ff2b1))

### 📖 Documentation

- Add comparison section between omnichron and urlfinder with usage scenarios ([b32b163](https://github.com/oritwoen/omnichron/commit/b32b163))
- **archive:** Fix outdated reference in JSDoc comment ([592b2a5](https://github.com/oritwoen/omnichron/commit/592b2a5))

#### ⚠️ Breaking Changes

- ⚠️ Rename `getSnapshots` to `snapshots` across the codebase for consistency ([ebe318c](https://github.com/oritwoen/omnichron/commit/ebe318c))

### ❤️ Contributors

- Dominik Opyd <dominik.opyd@gmail.com>

## v0.3.1

[compare changes](https://github.com/oritwoen/omnichron/compare/v0.3.0...v0.3.1)

### 🚀 Enhancements

- **build:** Use `obuild` instead `unbuild` ([4ea7fc4](https://github.com/oritwoen/omnichron/commit/4ea7fc4))

### 💅 Refactors

- **playground:** Use nuxt/cloudflare examples ([1adeb61](https://github.com/oritwoen/omnichron/commit/1adeb61))

### 🏡 Chore

- **playground:** Add initial setup script for building and installing dependencies ([b27a76a](https://github.com/oritwoen/omnichron/commit/b27a76a))

### ❤️ Contributors

- Dominik Opyd <dominik.opyd@gmail.com>

## v0.3.0

[compare changes](https://github.com/oritwoen/omnichron/compare/v0.2.10...v0.3.0)

### 🚀 Enhancements

- ⚠️ Implement lazy-loading ([961643e](https://github.com/oritwoen/omnichron/commit/961643e))

### 💅 Refactors

- Streamline provider imports and usage in archive creation ([bfb7154](https://github.com/oritwoen/omnichron/commit/bfb7154))
- Remove unused ArchiveInterface import from archive.ts ([30bd845](https://github.com/oritwoen/omnichron/commit/30bd845))
- Update usage examples to utilize lazy-loading for archive providers ([13bef50](https://github.com/oritwoen/omnichron/commit/13bef50))

### 🏡 Chore

- Remove old playgrounds ([50de406](https://github.com/oritwoen/omnichron/commit/50de406))

#### ⚠️ Breaking Changes

- ⚠️ Implement lazy-loading ([961643e](https://github.com/oritwoen/omnichron/commit/961643e))

### ❤️ Contributors

- Dominik Opyd <dominik.opyd@gmail.com>

## v0.2.10

[compare changes](https://github.com/oritwoen/omnichron/compare/v0.2.9...v0.2.10)

### 💅 Refactors

- Replace ofetch with $fetch in archive providers ([47075a0](https://github.com/oritwoen/omnichron/commit/47075a0))
- Improve test suite ([af7c9db](https://github.com/oritwoen/omnichron/commit/af7c9db))

### 🏡 Chore

- Update packageManager to pnpm@10.8.1 ([1643f47](https://github.com/oritwoen/omnichron/commit/1643f47))

### ❤️ Contributors

- Dominik Opyd <dominik.opyd@gmail.com>

## v0.2.9

[compare changes](https://github.com/oritwoen/omnichron/compare/v0.2.8...v0.2.9)

### 🚀 Enhancements

- Add webcite provider ([1ee9024](https://github.com/oritwoen/omnichron/commit/1ee9024))

### 💅 Refactors

- Remove unused permacc.mjs file and update permacc provider to require apiKey ([7c48b48](https://github.com/oritwoen/omnichron/commit/7c48b48))
- Remove UK Web Archive provider and related tests ([19279bd](https://github.com/oritwoen/omnichron/commit/19279bd))
- Remove Memento Time Travel provider and related tests ([11c6c0f](https://github.com/oritwoen/omnichron/commit/11c6c0f))

### ❤️ Contributors

- Dominik Opyd <dominik.opyd@gmail.com>

## v0.2.8

[compare changes](https://github.com/oritwoen/omnichron/compare/v0.2.7...v0.2.8)

### 🩹 Fixes

- Enhance Common Crawl provider to handle collection fetching ([2ebe1ef](https://github.com/oritwoen/omnichron/commit/2ebe1ef))

### ❤️ Contributors

- Dominik Opyd <dominik.opyd@gmail.com>

## v0.2.7

[compare changes](https://github.com/oritwoen/omnichron/compare/v0.2.6...v0.2.7)

### 🩹 Fixes

- Update archive.today provider to use Memento API ([0960ea4](https://github.com/oritwoen/omnichron/commit/0960ea4))
- Update snapshot URL handling and improve test cases for archive.today provider ([e290273](https://github.com/oritwoen/omnichron/commit/e290273))

### 💅 Refactors

- Rename variables for clarity in archive provider and debug script ([ecf191b](https://github.com/oritwoen/omnichron/commit/ecf191b))

### ❤️ Contributors

- Dominik Opyd <dominik.opyd@gmail.com>

## v0.2.6

[compare changes](https://github.com/oritwoen/omnichron/compare/v0.2.5...v0.2.6)

### 🩹 Fixes

- Update package paths and import statements for better module resolution ([dfc4120](https://github.com/oritwoen/omnichron/commit/dfc4120))

### ❤️ Contributors

- Dominik Opyd <dominik.opyd@gmail.com>

## v0.2.5

[compare changes](https://github.com/oritwoen/omnichron/compare/v0.2.4...v0.2.5)

### 🏡 Chore

- Update build process ([7bc36e5](https://github.com/oritwoen/omnichron/commit/7bc36e5))

### ❤️ Contributors

- Dominik Opyd <dominik.opyd@gmail.com>

## v0.2.4

[compare changes](https://github.com/oritwoen/omnichron/compare/v0.2.3...v0.2.4)

### 🚀 Enhancements

- Add configuration management ([0a3e802](https://github.com/oritwoen/omnichron/commit/0a3e802))
- Add Memento Time Travel provider ([0bebe08](https://github.com/oritwoen/omnichron/commit/0bebe08))

### ❤️ Contributors

- Dominik Opyd <dominik.opyd@gmail.com>

## v0.2.3

[compare changes](https://github.com/oritwoen/omnichron/compare/v0.2.2...v0.2.3)

### 🩹 Fixes

- Update package versions to remove caret and link specifications for consistency ([bedb94c](https://github.com/oritwoen/omnichron/commit/bedb94c))

### 🏡 Chore

- Rename `cache` to `storage` ([1f1e860](https://github.com/oritwoen/omnichron/commit/1f1e860))

### ❤️ Contributors

- Dominik Opyd <dominik.opyd@gmail.com>

## v0.2.2

[compare changes](https://github.com/oritwoen/omnichron/compare/v0.2.1...v0.2.2)

### 🚀 Enhancements

- Enhance performance and caching across multiple providers ([bf9257f](https://github.com/oritwoen/omnichron/commit/bf9257f))
- Add structured logging with consola for improved error handling ([ecc3989](https://github.com/oritwoen/omnichron/commit/ecc3989))

### 💅 Refactors

- **tests:** Update provider handling and skip error tests for various archives ([69203fe](https://github.com/oritwoen/omnichron/commit/69203fe))
- **docs:** Simplify usage examples and update provider imports in README ([07b871e](https://github.com/oritwoen/omnichron/commit/07b871e))
- Integrate normalizeDomain and mapCdxRows utility functions across providers ([aa07d53](https://github.com/oritwoen/omnichron/commit/aa07d53))
- Simplify mapCdxRows by destructuring parameters for clarity ([1145833](https://github.com/oritwoen/omnichron/commit/1145833))
- Streamline playground scripts by removing unused files and optimizing imports ([de35328](https://github.com/oritwoen/omnichron/commit/de35328))
- Enhance archive functions by adding getPages and improving documentation ([62f12c6](https://github.com/oritwoen/omnichron/commit/62f12c6))
- **docs:** Enhance provider documentation with detailed descriptions and method signatures ([21f9698](https://github.com/oritwoen/omnichron/commit/21f9698))
- Replace logical OR with nullish coalescing operator for improved clarity ([1f8c2e8](https://github.com/oritwoen/omnichron/commit/1f8c2e8))
- Enhance type safety by adding specific metadata interfaces for archive providers ([3a38187](https://github.com/oritwoen/omnichron/commit/3a38187))
- Remove unused metadata types and enhance ArchivedPage typing for better clarity ([dbe77cd](https://github.com/oritwoen/omnichron/commit/dbe77cd))
- Add provider metadata to mapCdxRows and enhance metadata interfaces for better clarity ([8838c9c](https://github.com/oritwoen/omnichron/commit/8838c9c))
- Replace clearCache with storage.clear for improved cache management ([5526f65](https://github.com/oritwoen/omnichron/commit/5526f65))
- Replace forEach with for...of loops for improved performance and clarity ([f7465ab](https://github.com/oritwoen/omnichron/commit/f7465ab))

### ❤️ Contributors

- Dominik Opyd <dominik.opyd@gmail.com>

## v0.2.1

[compare changes](https://github.com/oritwoen/omnichron/compare/v0.2.0...v0.2.1)

### 🚀 Enhancements

- Add cache layer ([af5ba10](https://github.com/oritwoen/omnichron/commit/af5ba10))

### 🩹 Fixes

- Update import path for utility functions in wayback provider ([19a15a6](https://github.com/oritwoen/omnichron/commit/19a15a6))

### 💅 Refactors

- Update provider name handling ([9ddcbea](https://github.com/oritwoen/omnichron/commit/9ddcbea))

### ❤️ Contributors

- Dominik Opyd <dominik.opyd@gmail.com>

## v0.2.0

[compare changes](https://github.com/oritwoen/omnichron/compare/v0.1.2...v0.2.0)

### 💅 Refactors

- ⚠️ Rename platform to provider ([48d8cd3](https://github.com/oritwoen/omnichron/commit/48d8cd3))
- Update terminology from platforms to providers in README ([e8f5a5b](https://github.com/oritwoen/omnichron/commit/e8f5a5b))
- Streamline response handling and utility functions across providers ([161b2d9](https://github.com/oritwoen/omnichron/commit/161b2d9))
- Update terminology from platforms to providers and restructure provider exports ([3c99380](https://github.com/oritwoen/omnichron/commit/3c99380))

#### ⚠️ Breaking Changes

- ⚠️ Rename platform to provider ([48d8cd3](https://github.com/oritwoen/omnichron/commit/48d8cd3))

### ❤️ Contributors

- Dominik Opyd <dominik.opyd@gmail.com>

## v0.1.2

[compare changes](https://github.com/oritwoen/omnichron/compare/v0.1.1...v0.1.2)

### 🚀 Enhancements

- Add UK Web Archive platform support with snapshot fetching and tests ([4e6aed0](https://github.com/oritwoen/omnichron/commit/4e6aed0))

### ❤️ Contributors

- Dominik Opyd <dominik.opyd@gmail.com>

## v0.1.1

### 💅 Refactors

- Replace listPages with getSnapshots in test files ([e6e19d3](https://github.com/oritwoen/omnichron/commit/e6e19d3))

### ❤️ Contributors

- Dominik Opyd <dominik.opyd@gmail.com>
