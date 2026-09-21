import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { useI18n } from "@/i18n";

type UploadProgress = { name: string; percent: number; saving: boolean };
export function useRunEvidenceUpload(runId: number, refresh: () => Promise<unknown>) {
  const { t } = useI18n();
  const limits = trpc.runExecution.evidenceLimits.useQuery();
  const request = useRef<XMLHttpRequest | null>(null);
  const mounted = useRef(true);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; request.current?.abort(); }; }, []);
  const maxMB = limits.data ? limits.data.maxBytes / 1024 / 1024 : null;
  const uploadFile = async (nodeKey: string, file?: File) => {
    if (!file || request.current) return;
    if (!limits.data) { toast.error(t("正在读取上传限制，请稍后重试")); return; }
    if (!file.size) { toast.error(t("原始文件不能为空")); return; }
    if (file.size > limits.data.maxBytes) { toast.error(t("请上传不超过 {n} MB 的原始文件", { n: maxMB! })); return; }
    const xhr = new XMLHttpRequest(); request.current = xhr;
    setProgress({ name: file.name, percent: 0, saving: false });
    try {
      const reused = await new Promise<boolean>((resolve, reject) => {
        xhr.open("POST", `/api/run-files/upload?${new URLSearchParams({ runId: String(runId), nodeKey, name: file.name })}`);
        xhr.setRequestHeader("Content-Type", "application/octet-stream");
        xhr.timeout = 10 * 60 * 1000;
        xhr.upload.onprogress = event => { if (mounted.current && event.lengthComputable) setProgress({ name: file.name, percent: Math.min(99, Math.round(event.loaded / event.total * 100)), saving: false }); };
        xhr.upload.onload = () => { if (mounted.current) setProgress({ name: file.name, percent: 100, saving: true }); };
        xhr.onload = () => {
          let response: { id?: number; reused?: boolean; error?: string; message?: string } = {};
          try { response = JSON.parse(xhr.responseText); } catch { /* A proxy may return a non-JSON error page. */ }
          if (xhr.status >= 200 && xhr.status < 300 && response.id) { resolve(!!response.reused); return; }
          const message = response.error === "TOO_LARGE" || xhr.status === 413 ? t("请上传不超过 {n} MB 的原始文件", { n: maxMB! })
            : response.error === "INVALID_FILE" ? t("文件名或步骤信息无效")
            : response.error === "INTERRUPTED" ? t("上传已中断，请重新选择文件")
            : response.message ? t(response.message) : t("原始文件保存失败，请重试");
          reject(new Error(message));
        };
        xhr.onerror = () => reject(new Error(t("上传连接中断，文件列表将刷新，请确认后重试")));
        xhr.ontimeout = () => reject(new Error(t("上传超时，文件列表将刷新，请确认后重试")));
        xhr.onabort = () => reject(new Error(t("已停止上传，文件列表将刷新")));
        xhr.send(file);
      });
      if (mounted.current) toast.success(t(reused ? "此文件已保存，沿用已有记录" : "原始文件已保存"));
    } catch (error) {
      if (mounted.current) toast.error(error instanceof Error ? error.message : t("原始文件保存失败，请重试"));
    } finally {
      request.current = null;
      if (mounted.current) { setProgress(null); await refresh().catch(() => undefined); }
    }
  };
  return { uploadFile, progress, maxMB, pending: !!progress, unavailable: !limits.data, cancel: () => request.current?.abort() };
}
