const paths: Record<string, string> = {
  Changes: "M8 3v18m8-18v18M4 7h8m0 10h8", Terminal: "m4 6 6 6-6 6m9 0h7",
  Files: "M3 6h7l2 3h9v11H3Z", Browser: "M3 5h18v15H3Zm0 4h18",
  "Side chat": "M4 4h16v12H9l-5 4Z", Insights: "M5 20v-6m7 6V4m7 16V9",
  Extensions: "M4 4h6v6H4Zm10 0h6v6h-6ZM4 14h6v6H4Zm10 0h6v6h-6Z",
  Settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm-2-5h4l1 3 3 1 3 3v4l-3 1-1 3-3 3h-4l-1-3-3-1-3-3v-4l3-1 1-3Z",
  Back: "m14 5-7 7 7 7M7 12h14", Copy: "M8 8h12v12H8Zm-4 8V4h12", Edit: "m15 4 5 5M4 20l5-1L21 7l-5-5L4 14Z",
  Trash: "M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7",
  Pin: "M8 3h8l-1 6 4 4H5l4-4ZM12 13v8", More: "M5 12h.01M12 12h.01M19 12h.01",
  Plus: "M12 4v16M4 12h16", Close: "m5 5 14 14M19 5 5 19", Up: "m5 15 7-7 7 7", Down: "m5 9 7 7 7-7",
  Play: "m7 4 14 8-14 8Z", Stop: "M5 5h14v14H5Z", ReadOnly: "M3 12s3-7 9-7 9 7 9 7-3 7-9 7-9-7-9-7Zm6 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0",
  Agent: "m5 5 14 14M5 19 19 5M8 3v4m-5 4h4m13 2h-4m-4 8v-4",
  PR: "M6 3v13a3 3 0 1 0 0 6 3 3 0 0 0 0-6M6 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm7 2h2a3 3 0 0 1 3 3v8m-3-8-3-3 3-3m3 14a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
  Plan: "M6 3h9l4 4v14H6Zm8 0v5h5M9 12h7m-7 4h7",
  Group: "M3 4h18v5H3Zm0 9h8v7H3Zm12 0h6v7h-6Z", Link: "m9 15 6-6M8 16l-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m2 1 2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0",
};
export function Icon({ name }: { name: string }) {
  return <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d={paths[name] ?? paths.Plus} fill="none" stroke="currentColor" strokeWidth={name === "More" ? "4" : "1.6"} strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
