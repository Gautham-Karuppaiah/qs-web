const strip = (hex: string) => (hex.startsWith("\\x") ? hex.slice(2) : hex);

export const toHex = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  let out = "\\x";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
};

export const hexBytes = (hex: string) => {
  const body = strip(hex);
  const bytes = new Uint8Array(body.length / 2);
  for (let i = 0; i < bytes.length; i++)
    bytes[i] = parseInt(body.substr(i * 2, 2), 16);
  return bytes;
};

export const hexToDataUrl = (hex: string, mime = "image/png") => {
  let binary = "";
  for (const byte of hexBytes(hex)) binary += String.fromCharCode(byte);
  return `data:${mime};base64,${btoa(binary)}`;
};

export const be32 = (hex: string, byte: number) =>
  parseInt(strip(hex).substr(byte * 2, 8), 16);
