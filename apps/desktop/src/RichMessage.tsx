import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function RichMessage({ text, openLink }: { text: string; openLink: (href: string) => void }) {
  return <Markdown remarkPlugins={[remarkGfm]} components={{
    a: ({ href, children }) => <a href={href} onClick={(event) => { event.preventDefault(); if (href) openLink(href); }}>{children}</a>,
    img: ({ alt }) => <span>[Image omitted: {alt || "remote image"}]</span>,
  }}>{text}</Markdown>;
}
