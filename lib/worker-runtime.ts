export async function replaceHeartbeat(
  source: string,
  target: string,
  replace: (a: string, b: string) => Promise<unknown>,
  sleep: (ms: number) => Promise<unknown>,
) {
  for (let attempt = 0; ; attempt++) {
    try {
      await replace(source, target);
      return;
    } catch (error: any) {
      if (attempt >= 3 || !["EPERM", "EACCES", "EBUSY"].includes(error.code))
        throw error;
      await sleep(50 * (attempt + 1));
    }
  }
}
