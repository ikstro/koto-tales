import { saveFileText } from '../systems/save';

/**
 * ?savefile=1: a page for the parents, not part of the game. It downloads the save as it is stored
 * and leaves a link for a browser that wants a tap first. Nothing is read into the game or written.
 */
export function offerSaveFile(): void {
  const text = saveFileText();
  const link = document.createElement('a');
  Object.assign(link.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '9999',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    textAlign: 'center',
    font: '900 24px Nunito, sans-serif',
    color: '#4a2c14',
    background: '#ffe3a3',
  });
  link.textContent = text ? 'Завантажити збереження' : 'Збереження немає';
  document.body.appendChild(link);
  if (!text) return;
  link.download = 'koto-save.json';
  link.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  link.click();
}
