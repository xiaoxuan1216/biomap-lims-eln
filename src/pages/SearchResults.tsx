import { trpc } from "@/providers/trpc";
import { Link, useSearchParams } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  NotebookPen,
  TestTubes,
  FolderKanban,
  Dna,
  Snowflake,
  SearchX,
} from "lucide-react";
import { EXP_STATUS, LOCATION_TYPES, SAMPLE_TYPES, SEQ_TYPES } from "@/lib/labels";

export default function SearchResults() {
  const [params] = useSearchParams();
  const q = params.get("q") ?? "";
  const { data, isLoading } = trpc.dashboard.search.useQuery(
    { q },
    { enabled: q.length > 0 },
  );

  const total =
    (data?.experiments.length ?? 0) +
    (data?.samples.length ?? 0) +
    (data?.projects.length ?? 0) +
    (data?.sequences.length ?? 0) +
    (data?.locations.length ?? 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">搜索「{q}」</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isLoading ? "搜索中…" : `共找到 ${total} 条结果`}
        </p>
      </div>

      {!isLoading && total === 0 && (
        <Card className="py-16">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <SearchX className="h-10 w-10 opacity-40" />
            <p>没有找到匹配的内容，换个关键词试试</p>
          </div>
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        {!!data?.experiments.length && (
          <ResultCard icon={NotebookPen} title={`实验记录（${data.experiments.length}）`}>
            {data.experiments.map((e) => (
              <ResultLink key={e.id} to={`/experiments/${e.id}`}
                main={`${e.code} ${e.title}`}
                right={
                  <Badge variant="outline" className={EXP_STATUS[e.status]?.cls}>
                    {EXP_STATUS[e.status]?.label}
                  </Badge>
                }
              />
            ))}
          </ResultCard>
        )}

        {!!data?.samples.length && (
          <ResultCard icon={TestTubes} title={`样本（${data.samples.length}）`}>
            {data.samples.map((s) => (
              <ResultLink key={s.id} to={`/samples/${s.id}`}
                main={`${s.sku} ${s.name}`}
                sub={`${SAMPLE_TYPES[s.type]?.label ?? s.type} · 余量 ${s.quantity} ${s.unit}`}
              />
            ))}
          </ResultCard>
        )}

        {!!data?.projects.length && (
          <ResultCard icon={FolderKanban} title={`项目（${data.projects.length}）`}>
            {data.projects.map((p) => (
              <ResultLink key={p.id} to={`/projects/${p.id}`} main={p.name} />
            ))}
          </ResultCard>
        )}

        {!!data?.sequences.length && (
          <ResultCard icon={Dna} title={`序列（${data.sequences.length}）`}>
            {data.sequences.map((s) => (
              <ResultLink key={s.id} to="/sequences"
                main={s.name}
                right={<Badge variant="outline">{SEQ_TYPES[s.type]}</Badge>}
              />
            ))}
          </ResultCard>
        )}

        {!!data?.locations.length && (
          <ResultCard icon={Snowflake} title={`存储位置（${data.locations.length}）`}>
            {data.locations.map((l) => (
              <ResultLink
                key={l.id}
                to={l.type === "box" ? `/storage/box/${l.id}` : "/storage"}
                main={l.name}
                right={<Badge variant="outline">{LOCATION_TYPES[l.type]}</Badge>}
              />
            ))}
          </ResultCard>
        )}
      </div>
    </div>
  );
}

function ResultCard({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof NotebookPen;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Icon className="h-4 w-4 text-teal-600" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">{children}</CardContent>
    </Card>
  );
}

function ResultLink({
  to,
  main,
  sub,
  right,
}: {
  to: string;
  main: string;
  sub?: string;
  right?: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2 rounded-lg border px-3 py-2.5 hover:border-teal-300 hover:bg-teal-50/40 transition-colors"
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{main}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </div>
      {right}
    </Link>
  );
}
