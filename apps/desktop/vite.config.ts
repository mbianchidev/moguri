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
    // Splitting the shared protocol/SDK code needs strict order: its schemas reference each other across modules.
    rolldownOptions: { output: { strictExecutionOrder: true, codeSplitting: { groups: [
      { name: "shared", test: /[\\/]packages[\\/](?:protocol|sdk|client)[\\/]src[\\/]/, maxSize: 450 * 1024 },
    ] } } },
  },
});
