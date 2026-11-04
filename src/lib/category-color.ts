const TEXT_PRIMARY = "#1A202C";
const WHITE = "#FFFFFF";

function srgbChannel(value: number) {
  const channel = value / 255;
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string) {
  const red = srgbChannel(Number.parseInt(hex.slice(1, 3), 16));
  const green = srgbChannel(Number.parseInt(hex.slice(3, 5), 16));
  const blue = srgbChannel(Number.parseInt(hex.slice(5, 7), 16));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(first: number, second: number) {
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

const textPrimaryLuminance = relativeLuminance(TEXT_PRIMARY);
const whiteLuminance = relativeLuminance(WHITE);

export function categoryTextColor(background: string) {
  if (!/^#[0-9A-Fa-f]{6}$/.test(background)) {
    return undefined;
  }

  const luminance = relativeLuminance(background);
  const whiteContrast = contrastRatio(luminance, whiteLuminance);
  const textContrast = contrastRatio(luminance, textPrimaryLuminance);
  return whiteContrast > textContrast ? WHITE : undefined;
}
