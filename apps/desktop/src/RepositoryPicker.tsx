import type { Session } from "../../../packages/sdk/src/index.ts";

export function RepositoryPicker({ session, value, change, label }: {
  session: Session; value: string; change: (repository: string) => void; label: string;
}) {
  if (!session.repositories) return null;
  return <label className="setting-field repository-picker">{label} repository
    <select aria-label={`${label} repository`} value={value} onChange={(event) => change(event.target.value)}>
      <option value="">Select a captured repository</option>
      {session.repositories.map((repository) => <option key={repository.projectId} value={repository.projectId}>{repository.name}</option>)}
    </select>
  </label>;
}
