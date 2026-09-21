import { useEffect, useState } from "react";
import { useBeforeUnload } from "react-router";
import { trpc } from "@/providers/trpc";
import type { RunDraftPayload } from "@contracts/runDraft";

export type DraftInitial = { id: string; revision: number; payload: RunDraftPayload; unsaved?: boolean };
export function useRunDraft(payload: RunDraftPayload | null, initial: DraftInitial | undefined, storageKey: string) {
  const [id] = useState(() => initial?.id ?? crypto.randomUUID());
  const [revision, setRevision] = useState(initial?.revision ?? 0);
  const [saved, setSaved] = useState(initial && !initial.unsaved ? JSON.stringify(initial.payload) : "");
  const fingerprint = payload ? JSON.stringify(payload) : "";
  const save = trpc.runDraft.save.useMutation();
  const { mutate, isPending, isError } = save;
  const dirty = !!fingerprint && fingerprint !== saved;
  useBeforeUnload(event => { if (dirty || isPending) { event.preventDefault(); event.returnValue = ""; } });
  useEffect(() => {
    if (!fingerprint) return;
    try { localStorage.setItem(storageKey, JSON.stringify({ id, revision, payload: JSON.parse(fingerprint) })); }
    catch { /* Server saving remains authoritative when browser storage is unavailable. */ }
    if (!dirty || isPending || isError) return;
    const timer = window.setTimeout(() => mutate({ id, expectedRevision: revision, payload: JSON.parse(fingerprint) }, {
      onSuccess: result => { setRevision(result.revision); setSaved(fingerprint); },
    }), 600);
    return () => window.clearTimeout(timer);
  }, [fingerprint, storageKey, id, revision, dirty, isPending, isError, mutate]);
  return { id, revision, saved: !dirty && !isPending && revision > 0, error: save.error, retry: save.reset, removeLocal: () => { try { localStorage.removeItem(storageKey); } catch { /* No browser cache available. */ } } };
}
