export async function settleUploadsBeforeCleanup(
  uploads: Array<Promise<unknown>>,
  cleanup: () => Promise<unknown>,
) {
  const results = await Promise.allSettled(uploads);
  const failed = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (!failed) return;
  // 모든 형제 업로드가 종료된 뒤 정리해야 늦게 성공한 객체가 고아로 남지 않는다.
  await cleanup();
  throw failed.reason;
}
