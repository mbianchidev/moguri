import { Resvg } from "@resvg/resvg-js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

export async function buildIcons() {
  const source = await readFile("assets/moguri.svg", "utf8");
  const inner = source.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect x="0" y="0" width="1024" height="1024" rx="220" fill="#141922"/><g transform="translate(48 140) scale(5.8)">${inner}</g></svg>`;
  await mkdir("dist/branding", { recursive: true });
  await writeFile("dist/branding/moguri.svg", source);
  await writeFile("dist/branding/moguri.png", new Resvg(icon, { fitTo: { mode: "width", value: 1024 } }).render().asPng());
  if (process.platform === "darwin") {
    const directory = "dist/branding/moguri.iconset";
    await mkdir(directory);
    for (const size of [16, 32, 128, 256, 512]) for (const scale of [1, 2]) {
      await writeFile(`${directory}/icon_${size}x${size}${scale === 2 ? "@2x" : ""}.png`, new Resvg(icon, { fitTo: { mode: "width", value: size * scale } }).render().asPng());
    }
    execFileSync("iconutil", ["-c", "icns", "-o", "dist/branding/moguri.icns", directory]);
  }
}
