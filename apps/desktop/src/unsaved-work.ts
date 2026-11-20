/** In-place edits (such as a queued prompt being edited) that closing the window saves before it closes (D51). */
export interface UnsavedWork { dirty(): boolean; save(): Promise<void> }
const pending = new Set<UnsavedWork>();
export const registerUnsavedWork = (work: UnsavedWork) => { pending.add(work); return () => { pending.delete(work); }; };
export const hasUnsavedWork = () => [...pending].some((work) => work.dirty());
export const saveUnsavedWork = () => Promise.all([...pending].filter((work) => work.dirty()).map((work) => work.save())).then(() => undefined);
