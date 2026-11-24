/** Recadre l'image au centre en carré et la réduit (JPEG) avant l'envoi : photo légère, format homogène */
export async function resizeToSquare(file: Blob, size = 256, quality = 0.85): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas indisponible');
  ctx.fillStyle = '#fff'; // fond blanc pour les PNG/WebP transparents
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
  bmp.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('conversion impossible'))), 'image/jpeg', quality));
}
