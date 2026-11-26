export function translationPreviewCopy(item: {
  status: string;
  images: Array<unknown>;
  translationProgress?: { completed: number; failed: number; total: number };
}) {
  if (item.images.length) return null;
  if (item.status === "FAILED" || item.status === "CANCELED" || item.status === "INTERRUPTED") return "尚无译图，请查看任务状态后继续或重试。";
  const progress = item.translationProgress;
  const complete = item.status === "COMPLETED" || item.status === "SUCCESS"
    || Boolean(progress && progress.total > 0 && progress.completed >= progress.total && progress.failed === 0);
  if (complete) return "译图已完成。打开对照预览即可查看。";
  return "等待译图完成，预览将自动更新。";
}
