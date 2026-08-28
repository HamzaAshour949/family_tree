import { memo, useMemo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { BriefcaseBusiness, CalendarDays, UserRound, UsersRound } from "lucide-react";
import { lifeLabel, personName } from "../lib/family";
import { useI18n } from "../i18n";
import type { Person } from "../types";

export interface PersonNodeData {
  compact: boolean;
  relationshipCount: number;
  selected: boolean;
  person: Person;
  showLinkCounts: boolean;
  showPhotos: boolean;
  onSelect: (personId: string) => void;
}

export const PersonNode = memo((props: NodeProps) => {
  const data = props.data as unknown as PersonNodeData;
  const { familyText, t } = useI18n();
  const displayName = personName(data.person, familyText);
  const initials = useMemo(() => initialsOf(displayName), [displayName]);

  return (
    <div className={`person-node-shell ${data.compact ? "compact" : ""}`}>
      <Handle className="node-handle parent-target" id="parent-target" isConnectable={false} position={Position.Top} type="target" />
      <Handle className="node-handle child-source" id="child-source" isConnectable={false} position={Position.Bottom} type="source" />
      <Handle className="node-handle spouse-source" id="spouse-source" isConnectable={false} position={Position.Right} type="source" />
      <Handle className="node-handle spouse-target" id="spouse-target" isConnectable={false} position={Position.Left} type="target" />
      <button className={`person-node ${data.compact ? "compact" : ""} ${data.selected ? "selected" : ""} gender-${data.person.gender}`} onClick={() => data.onSelect(data.person.id)} type="button">
        <div className="person-card-head">
          <div className="person-avatar">
            <PersonAvatar initials={initials} photoUrl={data.showPhotos ? data.person.photoUrl : undefined} />
          </div>
          <span className={`gender-marker ${data.person.gender}`} aria-label={t(data.person.gender)}>{data.person.gender === "female" ? "F" : "M"}</span>
          <div>
            <h3 className="person-name">{displayName}</h3>
            <p className="person-meta">{lifeLabel(data.person, familyText)}</p>
          </div>
        </div>
        <div className="node-chip-row">
          {data.person.occupation ? (
            <span className="node-chip">
              <BriefcaseBusiness size={13} />
              {data.person.occupation}
            </span>
          ) : null}
          {data.showLinkCounts ? (
            <span className="node-chip">
              <UsersRound size={13} />
              {data.relationshipCount} {t("linksLower")}
            </span>
          ) : null}
          {data.person.birthDate ? (
            <span className="node-chip">
              <CalendarDays size={13} />
              {data.person.birthDate}
            </span>
          ) : null}
        </div>
      </button>
    </div>
  );
});

PersonNode.displayName = "PersonNode";

/** Falls back to initials when a photo URL is missing or fails to load. */
function PersonAvatar({ initials, photoUrl }: { initials: string; photoUrl?: string }) {
  const [failed, setFailed] = useState(false);
  if (photoUrl && !failed) {
    return <img alt="" loading="lazy" onError={() => setFailed(true)} referrerPolicy="no-referrer" src={photoUrl} />;
  }
  return <span>{initials || <UserRound size={20} />}</span>;
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}