import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type { GLViewer } from "3dmol";

/** 蛋白三级结构面板（3Dmol.js + 本地 PDB 文件） */
export function StructureView({ pdbId }: { pdbId: string }) {
  return <StructureViewContent key={pdbId} pdbId={pdbId} />;
}

function StructureViewContent({ pdbId }: { pdbId: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let viewer: GLViewer | null = null;
    (async () => {
      try {
        const [$3Dmol, res] = await Promise.all([
          import("3dmol"),
          fetch(`/pdb/${pdbId.toLowerCase()}.pdb`),
        ]);
        if (!res.ok) throw new Error("pdb not found");
        const pdb = await res.text();
        if (cancelled || !ref.current) return;
        viewer = $3Dmol.createViewer(ref.current, { backgroundColor: "#0f172a" });
        viewer.addModel(pdb, "pdb");
        /* 主链 cartoon（spectrum 着色）；配体 / HETATM 以球棍突出 */
        viewer.setStyle({}, { cartoon: { color: "spectrum" } });
        viewer.setStyle({ hetflag: true }, { stick: { radius: 0.3, colorscheme: "greenCarbon" } });
        viewer.zoomTo();
        viewer.render();
        if (!cancelled) setLoading(false);
      } catch {
        if (!cancelled) { setError(true); setLoading(false); }
      }
    })();
    return () => {
      cancelled = true;
      try { viewer?.clear(); } catch { /* noop */ }
    };
  }, [pdbId]);

  return (
    <div className="relative w-full h-[380px] rounded-lg overflow-hidden border bg-slate-900">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center text-slate-300 text-sm gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> PDB {pdbId}
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm">
          PDB {pdbId} unavailable
        </div>
      )}
      <div ref={ref} className="w-full h-full" />
      <div className="absolute bottom-2 left-3 text-[11px] text-slate-400 font-mono">
        PDB: {pdbId} · 3Dmol.js
      </div>
    </div>
  );
}
