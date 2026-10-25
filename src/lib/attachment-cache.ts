import { api } from "@/lib/tauri-api";

/**
 * Shared LRU cache for attachment previews.
 *
 * Base64 payloads are big (a screenshot easily reaches a few MB), so both the
 * Markdown preview and the attachment gallery go through this module: entries
 * are capped, in-flight reads are de-duplicated, and evicted when the limit is
 * reached.
 */
const MAX_ENTRIES = 40;
const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

export function getCachedAttachment(path: string): string | undefined {
  const hit = cache.get(path);
  if (hit !== undefined) {
    // Refresh recency so the LRU order matches actual usage.
    cache.delete(path);
    cache.set(path, hit);
  }
  return hit;
}

export function loadAttachmentImage(path: string): Promise<string> {
  const cached = getCachedAttachment(path);
  if (cached !== undefined) return Promise.resolve(cached);

  const pending = inflight.get(path);
  if (pending) return pending;

  const task = api
    .readAttachmentBase64(path)
    .then((dataUrl) => {
      if (cache.size >= MAX_ENTRIES) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
      cache.set(path, dataUrl);
      return dataUrl;
    })
    .finally(() => {
      inflight.delete(path);
    });

  inflight.set(path, task);
  return task;
}

export function forgetAttachment(path: string) {
  cache.delete(path);
  inflight.delete(path);
}
