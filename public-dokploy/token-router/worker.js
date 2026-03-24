import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3';

env.allowLocalModels = false;

let embedder = null;
let activeDevice = 'wasm';

async function loadWithFallback(modelId, progressCb) {
  try {
    activeDevice = 'webgpu';
    return await pipeline('feature-extraction', modelId, {
      dtype: 'fp16',
      device: 'webgpu',
      progress_callback: progressCb,
    });
  } catch {
    activeDevice = 'wasm';
    return await pipeline('feature-extraction', modelId, {
      dtype: 'q8',
      device: 'wasm',
      progress_callback: progressCb,
    });
  }
}

self.onmessage = async (e) => {
  const { type, payload, id } = e.data;

  if (type === 'load') {
    try {
      embedder = await loadWithFallback(
        payload.modelId || 'Xenova/all-MiniLM-L6-v2',
        (progress) => self.postMessage({ type: 'progress', payload: progress, id }),
      );
      self.postMessage({ type: 'loaded', payload: { device: activeDevice }, id });
    } catch (err) {
      self.postMessage({ type: 'error', payload: err?.message || String(err), id });
    }
    return;
  }

  if (type === 'embed') {
    try {
      const results = [];
      for (const text of payload.texts) {
        const out = await embedder(text, { pooling: 'mean', normalize: true });
        results.push(Array.from(out.data));
      }
      self.postMessage({ type: 'embedded', payload: { embeddings: results }, id });
    } catch (err) {
      self.postMessage({ type: 'error', payload: err?.message || String(err), id });
    }
  }
};
