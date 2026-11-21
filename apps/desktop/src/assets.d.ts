declare module "*.css";
declare module "*.svg" { const source: string; export default source; }
declare module "*.svg?raw" { const source: string; export default source; }
declare module "ghostty-web/ghostty-vt.wasm?url" { const url: string; export default url; }
declare module "*.png" { const source: string; export default source; }
