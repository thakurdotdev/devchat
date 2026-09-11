interface Props {
  members: Array<{ id: string; name: string; color: string; joinedAt?: number }>;
  onEditNickname: () => void;
}

export function MembersPanel({ members, onEditNickname }: Props) {
  return (
    <div class="members-panel">
      <div class="members-title">In this room ({members.length})</div>
      {members.map((m) => (
        <div key={m.id} class="member-row">
          <span class="member-dot" style={`background:${m.color}`} />
          <span class="member-name">{m.name}</span>
        </div>
      ))}
      <button class="member-edit" onClick={onEditNickname}>✏️ Change nickname</button>
    </div>
  );
}
