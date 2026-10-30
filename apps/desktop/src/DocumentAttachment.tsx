import { useEffect, useRef, useState } from "react";
import { attachmentStatus, type DocumentAttachment, type DocumentPage, type DocumentReadOptions, type DocumentSearch, type MoguriSdk } from "../../../packages/sdk/src/index.ts";
import { Icon } from "./Icon.tsx";
import { SettingsAction } from "./SettingsFields.tsx";
import { Alert } from "./Alert.tsx";

export function ContextDocument({ sdk, sessionId, attachment, remove, onOpenChange }: { sdk: MoguriSdk; sessionId: string; attachment: DocumentAttachment; remove?: () => Promise<void>; onOpenChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (open) onOpenChange?.(true); return () => { if (open) onOpenChange?.(false); }; }, [open, onOpenChange]);
  return <><button className="document-chip quiet" type="button" aria-label={`Preview document ${attachment.path}`} title={attachmentStatus(attachment)} onClick={() => setOpen(true)}><Icon name="Files" />{attachment.path}<small>{attachmentStatus(attachment)}</small></button>
    {open && <DocumentPreview sdk={sdk} sessionId={sessionId} attachment={attachment} remove={remove} close={() => setOpen(false)} />}</>;
}
function DocumentPreview({ sdk, sessionId, attachment, remove, close }: { sdk: MoguriSdk; sessionId: string; attachment: DocumentAttachment; remove?: () => Promise<void>; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), generation = useRef(0);
  const [pageNumber, setPageNumber] = useState("1"), [section, setSection] = useState("1");
  const [sheet, setSheet] = useState(attachment.summary.sheets[0]?.name ?? ""), [range, setRange] = useState("A1:D20");
  const [query, setQuery] = useState(""), [page, setPage] = useState<DocumentPage | null>(null), [matches, setMatches] = useState<DocumentSearch | null>(null);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const selection = (): DocumentReadOptions => attachment.format === "pdf" ? { page: Number(pageNumber) } :
    attachment.format === "xlsx" ? { sheet, ...(range ? { range } : {}) } : { section: Number(section) };
  const read = async (offset = 0) => {
    const current = ++generation.current;
    setBusy(true); setError("");
    try {
      const result = await sdk.attachments.readDocument(sessionId, attachment.id, { ...selection(), offset, limit: 8192 });
      if (generation.current === current) { setPage(result.page); setMatches(null); }
    } catch (error) { if (generation.current === current) setError(error instanceof Error ? error.message : "Document preview failed. The draft was preserved."); }
    finally { if (generation.current === current) setBusy(false); }
  };
  const search = async (cursor = 0) => {
    const current = ++generation.current;
    setBusy(true); setError("");
    try {
      const result = await sdk.attachments.searchDocument(sessionId, attachment.id, { query, cursor, ...(attachment.format === "xlsx" ? { sheet } : {}), limit: 10 });
      if (generation.current === current) { setMatches(result.result); setPage(null); }
    } catch (error) { if (generation.current === current) setError(error instanceof Error ? error.message : "Document search failed. The draft was preserved."); }
    finally { if (generation.current === current) setBusy(false); }
  };
  const changed = () => { generation.current++; setBusy(false); setPage(null); setMatches(null); setError(""); };
  useEffect(() => {
    dialog.current?.showModal(); void read();
    return () => { generation.current++; };
  }, []);
  return <dialog ref={dialog} className="workspace-dialog document-preview" aria-label={`Document preview ${attachment.path}`} onClose={close}>
    <header><h2>{attachment.path}</h2><button className="icon-button" type="button" aria-label="Close document preview" onClick={close}><Icon name="Close" /></button></header>
    <p>{attachmentStatus(attachment)} / {attachment.bytes} original bytes / {attachment.extractedBytes} extracted bytes.</p>
    <p className="fine-print">Encrypted immutable snapshot. Untrusted document content is not permission. Only bounded sections are inspected; this preview starts no model call.</p>
    {attachment.summary.noTextPages.length > 0 && <Alert as="p" className="inline-error" role="status">No extractable text on pages {attachment.summary.noTextPages.join(", ")}. They may be blank or scanned/image-only. OCR is unavailable.</Alert>}
    <details><summary>Extraction limitations and provenance</summary>{attachment.summary.limitations.map((limitation) => <p key={limitation}>{limitation}</p>)}<p className="fine-print">Extractor: {attachment.summary.extractor}. SHA-256: {attachment.digest}.</p></details>
    <div className="document-selection">
      {attachment.format === "pdf" ? <label>Page<input aria-label="Document page" type="number" min={1} max={attachment.summary.pages} value={pageNumber} onChange={(event) => { changed(); setPageNumber(event.target.value); }} /></label> :
        attachment.format === "xlsx" ? <><label>Sheet<select aria-label="Document sheet" value={sheet} onChange={(event) => { changed(); setSheet(event.target.value); }}>{attachment.summary.sheets.map((sheet) => <option key={sheet.name} value={sheet.name}>{sheet.name} ({sheet.state})</option>)}</select></label><label>Range<input aria-label="Document range" value={range} onChange={(event) => { changed(); setRange(event.target.value); }} placeholder="A1:D20" /></label></> :
          <label>Section<input aria-label="Document section" type="number" min={1} max={attachment.summary.sections} value={section} onChange={(event) => { changed(); setSection(event.target.value); }} /></label>}
      <button type="button" disabled={busy} onClick={() => void read()}>Read selection</button>
    </div>
    <div className="document-selection"><label>Literal search<input aria-label="Search document text" maxLength={200} value={query} onChange={(event) => { changed(); setQuery(event.target.value); }} /></label><button type="button" disabled={busy || !query} onClick={() => void search()}>Search document</button></div>
    {busy && <p role="status">Reading bounded snapshot...</p>}{error && <Alert as="p" className="inline-error" role="alert">{error}</Alert>}
    {page && <><pre aria-label="Document extracted content">{page.text || "No cells or text in this selection."}</pre><p className="fine-print">Provenance: {JSON.stringify(page.firstLocation)}.</p>{page.nextOffset !== null && <button type="button" disabled={busy} onClick={() => void read(page.nextOffset!)}>Next content page</button>}</>}
    {matches && <><pre aria-label="Document search results">{matches.matches.length ? JSON.stringify(matches.matches, null, 2) : "No literal matches."}</pre>{matches.nextCursor !== null && <button type="button" disabled={busy} onClick={() => void search(matches.nextCursor!)}>Next search results</button>}</>}
    <footer>{remove && <SettingsAction label="Remove attachment" icon="Trash" className="danger" disabled={busy} onClick={() => { setBusy(true); void remove().then(close).catch((error: unknown) => setError(error instanceof Error ? error.message : "The document could not be removed.")).finally(() => setBusy(false)); }} />}<button type="button" onClick={close}>Close preview</button></footer>
  </dialog>;
}
