import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LOCATION_TYPES } from "@/lib/labels";

export interface LocationNode {
  id: number;
  name: string;
  type: string;
  parentId: number | null;
  rows: number | null;
  cols: number | null;
}

export function locationPath(locations: LocationNode[], id: number): string {
  const map = new Map(locations.map((l) => [l.id, l]));
  const parts: string[] = [];
  let cur = map.get(id);
  let guard = 0;
  while (cur && guard++ < 10) {
    parts.unshift(cur.name);
    cur = cur.parentId != null ? map.get(cur.parentId) : undefined;
  }
  return parts.join(" / ");
}

interface Props {
  locations: LocationNode[];
  value: number | null;
  onChange: (id: number | null) => void;
  /** 只允许选择冻存盒 */
  boxOnly?: boolean;
}

export default function LocationSelect({ locations, value, onChange, boxOnly }: Props) {
  const filtered = boxOnly ? locations.filter((l) => l.type === "box") : locations;
  return (
    <Select
      value={value != null ? String(value) : "none"}
      onValueChange={(v) => onChange(v === "none" ? null : Number(v))}
    >
      <SelectTrigger>
        <SelectValue placeholder="选择存储位置" />
      </SelectTrigger>
      <SelectContent>
        {!boxOnly && <SelectItem value="none">（不指定位置）</SelectItem>}
        {filtered.map((l) => (
          <SelectItem key={l.id} value={String(l.id)}>
            {locationPath(locations, l.id)}
            <span className="text-muted-foreground">（{LOCATION_TYPES[l.type]}）</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
