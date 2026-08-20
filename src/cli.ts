#!/usr/bin/env node

import { defineCommand, runMain } from "citty";
import { version } from "./version";

const main = defineCommand({
  meta: {
    name: "archives",
    version,
    description: "Unified interface for web archive providers",
  },
  subCommands: {
    mcp: () => import("./commands/mcp").then((m) => m.default),
  },
});

await runMain(main);
