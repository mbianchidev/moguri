import { AppWindow, Archive, ArrowLeft, ArrowUp, ArrowUpDown, BadgeDollarSign, BookOpen, Bot, Box, Brain, Car, ChartColumn, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Circle, CircleDot, CircleHelp, CirclePause, Clock, Copy, DollarSign, Ellipsis, Eye, File as FileIcon, FileDiff, FilePen, FilePlus, FileText, Folder, FolderOpen, GitBranch, GitMerge, GitPullRequest, Globe, GripVertical, Hand, House, Image as ImageIcon, Inbox, Infinity as InfinityIcon, Info, Layers, LayoutDashboard, Link, ListChecks, ListFilter, Loader, Maximize2, MessageSquare, Mic, Minimize2, PanelRight, Pencil, Pin, PinOff, Play, Plug, Plus, Puzzle, RefreshCw, Rocket, Search, SendHorizontal, Settings, Sparkles, Square, SquareTerminal, TrafficCone, Trash2, TriangleAlert, Wrench, X, type LucideIcon } from "lucide-react";
import type { ModelInfo } from "../../../packages/sdk/src/index.ts";

// Lucide (ISC) thin-stroke icons keep one consistent, professional weight across the app; names stay stable for callers and tests.
const icons: Record<string, LucideIcon> = {
  Changes: FileDiff, Terminal: SquareTerminal, Files: Folder, FolderOpen: FolderOpen, Browser: AppWindow, File: FileIcon, ReadFile: FileText,
  CreateFile: FilePlus, EditFile: FilePen, Search: Search, Skill: BookOpen, Issue: CircleDot, Mcp: Plug, Thought: Brain, Tool: Wrench,
  Info: Info, Progress: Loader, Image: ImageIcon, Insights: ChartColumn, Dashboard: LayoutDashboard, Extensions: Puzzle, Settings: Settings,
  Back: ArrowLeft, Copy: Copy, Edit: Pencil, Trash: Trash2, Pin: Pin, More: Ellipsis, Grip: GripVertical, Filter: ListFilter, Sort: ArrowUpDown,
  Circle: Circle, Refresh: RefreshCw, PinOff: PinOff, Plus: Plus, Close: X, Up: ChevronUp, Down: ChevronDown, ChevronLeft: ChevronLeft,
  ChevronRight: ChevronRight, Play: Play, ArrowUp: ArrowUp, Stop: Square, ReadOnly: Eye, Agent: Bot, PR: GitPullRequest, PRMerged: GitMerge,
  Plan: ListChecks, Artifacts: Archive, Candidates: GitBranch, Group: Layers, Link: Link, Send: SendHorizontal, Clock: Clock, Mic: Mic,
  Dollar: DollarSign, Infinity: InfinityIcon, House: House, Box: Box, Globe: Globe, Hand: Hand, Traffic: TrafficCone, Car: Car, Rocket: Rocket,
  Check: Check, BookOpen: BookOpen, PanelRight: PanelRight, Maximize: Maximize2, Minimize: Minimize2, Question: CircleHelp, Attention: TriangleAlert,
  Inbox: Inbox, Waiting: CirclePause, Suggestions: Sparkles, SideChat: MessageSquare, PriceSort: BadgeDollarSign,
};
/** Model brand marks stay hand-drawn: icon sets don't ship vendor logos. */
const brandPaths: Record<string, string> = {
  ModelGPT: "m7 3 10 0 5 9-5 9H7L2 12Zm1 5h8v8H8Zm4-5v5m0 8v5M2 12h6m8 0h6",
  ModelClaude: "M12 2v20M2 12h20M5 5l14 14M5 19 19 5M8 3l8 18M3 8l18 8M3 16l18-8M8 21l8-18",
  ModelGoogle: "M14 2c0 6-4 9-9 9 5 0 9 3 9 9 0-6 4-9 9-9-5 0-9-3-9-9ZM4 15v7m-3-3.5h6",
  ModelGrok: "M20 6a9 9 0 1 0 1 9M4 20 21 3m-7 0h7v7M8 8a6 6 0 0 1 8 0",
};
const aliases: Record<string, string> = { Sandbox: "Box", "Code change": "PR", "Work item": "Issue", "Side chat": "SideChat" };
export function modelIcon(model: Pick<ModelInfo, "id" | "apiModelId" | "source" | "synthetic">): string {
  if (model.synthetic) return "Suggestions";
  const label = (model.apiModelId ?? model.id).toLowerCase().split("/").at(-1) ?? "";
  if (/^(?:gpt|chatgpt|o\d)/.test(label)) return "ModelGPT";
  if (/^(?:anthropic[.:-])?claude/.test(label)) return "ModelClaude";
  if (/^(?:google[.:-])?gemini/.test(label)) return "ModelGoogle";
  if (/^(?:x-?ai[.:-])?grok/.test(label)) return "ModelGrok";
  return model.source === "local" ? "House" : "Agent";
}
export function Icon({ name }: { name: string }) {
  const brand = brandPaths[name];
  if (brand) return <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" data-icon={name}><path d={brand} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  const Glyph = icons[aliases[name] ?? name] ?? Plus;
  return <Glyph size={16} strokeWidth={1.75} aria-hidden="true" focusable="false" data-icon={name} />;
}
