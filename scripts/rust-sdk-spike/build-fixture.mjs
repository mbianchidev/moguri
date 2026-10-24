import { join } from "node:path";
import { directory, repo, packageImport } from "./paths.mjs";
const { build } = await packageImport("esbuild");
await build({
  entryPoints: [join(directory, "sdk-fixture.ts")], outfile: join(directory, "sdk-fixture.mjs"),
  bundle: true, platform: "node", format: "esm", target: "node26",
  plugins: [{ name: "absolute-package-exports", setup(build) {
    build.onResolve({ filter: /^[^./]/ }, async (args) => {
      if (args.pluginData?.externalResolution) return;
      const result = await build.resolve(args.path, { resolveDir: repo, kind: args.kind, pluginData: { externalResolution: true } });
      return { path: result.path, external: true, errors: result.errors, warnings: result.warnings };
    });
  } }],
});
console.log("Built isolated generated SDK service fixture.");
