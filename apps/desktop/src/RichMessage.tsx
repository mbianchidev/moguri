import { createContext, useContext, type ComponentProps } from "react";
import Markdown, { type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";
import { CopyButton } from "./CopyButton.tsx";

const CodeCopyContext = createContext(true);
const OpenLinkContext = createContext<((href: string) => void) | null>(null);
const codeText = (node: ExtraProps["node"]) => node?.children.map((child) => child.type === "text" ? child.value : "").join("") ?? "";
function linkedCode(node: ExtraProps["node"]): string[] {
  const values: string[] = [];
  const visit = (element: NonNullable<ExtraProps["node"]>) => {
    if (element.tagName === "code") { values.push(codeText(element)); return; }
    for (const child of element.children) if (child.type === "element") visit(child);
  };
  if (node) visit(node);
  return values;
}

function RichLink({ href, children, node }: ComponentProps<"a"> & ExtraProps) {
  const openLink = useContext(OpenLinkContext);
  if (!openLink) throw new Error("The Markdown link has no owning open-link handler.");
  return <><CodeCopyContext.Provider value={false}><a href={href} onClick={(event) => { event.preventDefault(); if (href) openLink(href); }}>{children}</a></CodeCopyContext.Provider>
    {linkedCode(node).map((value, index) => <CopyButton key={index} className="code-copy" label="Copy code snippet" text={value} source={value} />)}</>;
}
function CodeSnippet({ node, children, ...props }: ComponentProps<"code"> & ExtraProps) {
  const copy = useContext(CodeCopyContext), value = codeText(node);
  return <code {...props}>{children}{copy && <CopyButton className="code-copy" label="Copy code snippet" text={value} source={value} />}</code>;
}
const components = {
  a: RichLink, code: CodeSnippet,
  img: ({ alt }: ComponentProps<"img">) => <span>[Image omitted: {alt || "remote image"}]</span>,
};

export default function RichMessage({ text, openLink }: { text: string; openLink: (href: string) => void }) {
  return <OpenLinkContext.Provider value={openLink}><Markdown remarkPlugins={[remarkGfm]} components={components}>{text}</Markdown></OpenLinkContext.Provider>;
}
