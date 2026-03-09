import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3';

env.allowLocalModels = false;

let transcriber = null;

self.onmessage = async (e) => {
  const { type, payload, id } = e.data;

  if (type === 'load') {
    try {
      transcriber = await pipeline('automatic-speech-recognition', payload.modelId, {
        dtype: 'q8',
        device: 'wasm',
        progress_callback: (progress) => {
          self.postMessage({ type: 'progress', payload: progress, id });
        },
      });
      self.postMessage({ type: 'loaded', id });
    } catch (err) {
      self.postMessage({ type: 'error', payload: err.message, id });
    }
    return;
  }

  if (type === 'transcribe') {
    try {
      const result = await transcriber(payload.audio, payload.options);
      self.postMessage({ type: 'result', payload: result, id });
    } catch (err) {
      self.postMessage({ type: 'error', payload: err.message, id });
    }
    return;
  }
};
