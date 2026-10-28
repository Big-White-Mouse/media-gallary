const pending = new Set();
let frame = 0;
function flush() {
  frame = 0;
  const started = performance.now();
  let count = 0;
  for (const job of pending) {
    if (!job.ready()) continue;
    pending.delete(job); job.commit(); count++;
    if (count >= 3 || performance.now() - started >= 2) break;
  }
  if (pending.size) frame = requestAnimationFrame(flush);
}
export function commitFrame(commit, ready = () => true) {
  const job = { commit, ready };
  pending.add(job);
  if (!frame) frame = requestAnimationFrame(flush);
  return () => { pending.delete(job); if (!pending.size) { cancelAnimationFrame(frame); frame = 0; } };
}
