import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// Moguri always passes ghostty-web its bundled .wasm asset URL, so the library's ~560 kB base64 fallback is unreachable.
function externalGhosttyWasm(): Plugin {
  const embedded = /new URL\("data:application\/wasm;base64,[A-Za-z0-9+/=]+", self\.location\)/;
  return {
    name: "moguri-external-ghostty-wasm",
    enforce: "pre",
    transform(code, id) {
      if (!/[\\/]ghostty-web[\\/]dist[\\/]ghostty-web\.js$/.test(id)) return null;
      if (!embedded.test(code)) this.error("ghostty-web no longer embeds its wasm fallback as expected; review the external wasm build step before upgrading.");
      return { code: code.replace(embedded, '(() => { throw new Error("Moguri loads Ghostty only from its bundled wasm asset URL."); })()'), map: null };
    },
  };
}

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: "./",
  plugins: [react(), externalGhosttyWasm()],
  build: {
    outDir: "../../dist/desktop/renderer", emptyOutDir: true, target: "chrome148",
    // The installed SDK is one prebuilt module; keep it in its own chunk, in strict order with the code that uses it.
    // Keep `/*! @license */` notices, such as the vendored provider marks' MIT notice, in the shipped renderer.
    rolldownOptions: { output: { comments: { legal: true, annotation: false, jsdoc: false }, strictExecutionOrder: true, codeSplitting: { groups: [
      { name: "shared", test: /[\\/]node_modules[\\/]@moguri-dev[\\/]sdk[\\/]/ },
    ] } } },
  },
});
