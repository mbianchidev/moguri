import { createContext, useContext, type ComponentProps } from "react";
import Markdown, { type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";
import { CopyButton } from "./CopyButton.tsx";

const OpenLinkContext = createContext<((href: string) => void) | null>(null);
const codeText = (node: ExtraProps["node"]) => node?.children.map((child) => child.type === "text" ? child.value : "").join("") ?? "";

function RichLink({ href, children }: ComponentProps<"a"> & ExtraProps) {
  const openLink = useContext(OpenLinkContext);
  if (!openLink) throw new Error("The Markdown link has no owning open-link handler.");
  return <a href={href} onClick={(event) => { event.preventDefault(); if (href) openLink(href); }}>{children}</a>;
}
function CodeBlock({ node, children, ...props }: ComponentProps<"pre"> & ExtraProps) {
  const code = node?.children.find((child) => child.type === "element" && child.tagName === "code");
  const value = code?.type === "element" ? codeText(code) : null;
  return <pre {...props}>{children}{value !== null && <CopyButton className="code-copy" label="Copy code block" text={value} source={value} />}</pre>;
}
const components = {
  a: RichLink, pre: CodeBlock,
  img: ({ alt }: ComponentProps<"img">) => <span>[Image omitted: {alt || "remote image"}]</span>,
};

export default function RichMessage({ text, openLink }: { text: string; openLink: (href: string) => void }) {
  return <OpenLinkContext.Provider value={openLink}><Markdown remarkPlugins={[remarkGfm]} components={components}>{text}</Markdown></OpenLinkContext.Provider>;
}
