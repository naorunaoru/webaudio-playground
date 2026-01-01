import type { GraphConnection, PortKind } from "../types";
import { portKindColor } from "../nodeRegistry";

export type GraphConnectionPathProps = {
  connection: GraphConnection;
  d: string;
  isSelected: boolean;
  onSelect: (connectionId: string) => void;
  onFocusRoot: () => void;
};

export function GraphConnectionPath({
  connection,
  d,
  isSelected,
  onSelect,
  onFocusRoot,
}: GraphConnectionPathProps) {
  const color = portKindColor(connection.kind);

  return (
    <g>
      <path
        d={d}
        fill="none"
        stroke="transparent"
        strokeWidth={4}
        style={{ cursor: "pointer" }}
        pointerEvents="stroke"
        onPointerDown={(e) => {
          e.stopPropagation();
          onFocusRoot();
          onSelect(connection.id);
        }}
      />
      <path
        d={d}
        fill="none"
        stroke={isSelected ? "#ffffff" : color}
        strokeOpacity={isSelected ? 0.75 : 0.6}
        strokeWidth={2.25}
        pointerEvents="none"
      />
    </g>
  );
}
