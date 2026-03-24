import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3';

env.allowLocalModels = false;

let transcriber = null;

/**
 * Attempt to create a pipeline on the preferred device (webgpu),
 * falling back to wasm if unavailable.
 */
let activeDevice = 'wasm';

async function loadWithFallback(task, modelId, progressCb) {
  // WebGPU: use fp16 for speed; WASM: use q8 for compatibility
  try {
    activeDevice = 'webgpu';
    return await pipeline(task, modelId, {
      dtype: 'fp16',
      device: 'webgpu',
      progress_callback: progressCb,
    });
  } catch (err) {
    // Any WebGPU failure → fall back to WASM
    activeDevice = 'wasm';
    return await pipeline(task, modelId, {
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
      transcriber = await loadWithFallback(
        'automatic-speech-recognition',
        payload.modelId,
        (progress) => {
          self.postMessage({ type: 'progress', payload: progress, id });
        },
      );
      self.postMessage({ type: 'loaded', payload: { device: activeDevice }, id });
    } catch (err) {
      self.postMessage({ type: 'error', payload: err?.message || String(err), id });
    }
    return;
  }

  if (type === 'transcribe') {
    try {
      const result = await transcriber(payload.audio, payload.options);
      self.postMessage({ type: 'result', payload: result, id });
    } catch (err) {
      self.postMessage({ type: 'error', payload: err?.message || String(err), id });
    }
    return;
  }
};
