import { sandboxChannel } from './protocol';

let capturing = false;

export async function captureCanvas() {
  if (capturing) return;
  capturing = true;
  const buttons = document.querySelectorAll<HTMLButtonElement>('[data-sandbox-capture]');
  buttons.forEach(button => { button.disabled = true; });
  const send = (data: object, transfer: Transferable[] = []) => parent.postMessage({ channel: sandboxChannel, runId: window.name, type: 'capture', ...data }, '*', transfer);
  send({ status: 'started' });
  try {
    // Copy in the rendering frame, before the browser clears the GPU drawing buffer.
    const image = await new Promise<HTMLCanvasElement>((resolve, reject) => {
      requestAnimationFrame(() => {
        try {
          const canvas = document.querySelector('canvas');
          if (!canvas || !canvas.width || !canvas.height) throw new Error('撮影できる canvas がありません。描画後に試してください。');
          const copy = document.createElement('canvas');
          const scale = Math.min(1, 4096 / canvas.width, 4096 / canvas.height);
          copy.width = Math.max(1, Math.round(canvas.width * scale));
          copy.height = Math.max(1, Math.round(canvas.height * scale));
          const context = copy.getContext('2d');
          if (!context) throw new Error('画像を作成できませんでした。');
          context.drawImage(canvas, 0, 0, copy.width, copy.height);
          resolve(copy);
        } catch (error) { reject(error); }
      });
    });
    const blob = await new Promise<Blob>((resolve, reject) => image.toBlob(value => value ? resolve(value) : reject(new Error('PNG を作成できませんでした。')), 'image/png'));
    const buffer = await blob.arrayBuffer();
    send({ status: 'success', image: buffer }, [buffer]);
  } catch (error) { send({ status: 'error', message: error instanceof Error ? error.message : String(error) }); }
  finally { capturing = false; buttons.forEach(button => { button.disabled = false; }); }
}

export function installCaptureControls(scopeId: string) {
  // Decorate the owned STL toolbar so already-saved projects get the same capture control.
  const controls = document.querySelector('.stl-controls');
  if (controls && !controls.querySelector('[data-sandbox-capture]')) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'スクショを保存';
    button.dataset.sandboxCapture = '';
    button.setAttribute(scopeId, '');
    controls.append(button);
  }
  document.addEventListener('click', event => {
    if (event.target instanceof Element && event.target.closest('[data-sandbox-capture]')) void captureCanvas();
  });
}
