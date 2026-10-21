declare module "*.css";
declare module "*.svg" { const source: string; export default source; }
declare module "ghostty-web/ghostty-vt.wasm?url" { const url: string; export default url; }
