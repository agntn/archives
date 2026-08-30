import { defineNuxtConfig } from "nuxt/config";

export default defineNuxtConfig({
  compatibilityDate: "2025-04-20",

  future: {
    compatibilityVersion: 4,
  },

  nitro: {
    preset: "cloudflare_module",
    cloudflare: {
      nodeCompat: true,
    },

    experimental: {
      wasm: true,
    },
  },

  runtimeConfig: {
    permacc: {
      apiKey: "",
    },
  },
});
