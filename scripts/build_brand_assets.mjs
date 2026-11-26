// Dựng lại toàn bộ logo UELPATH từ SVG vector (một nguồn duy nhất).
// Chạy từ thư mục gốc:  node scripts/build_brand_assets.mjs
// Cần `sharp` (có sẵn trong web/node_modules).
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sharp = createRequire(path.join(root, "web", "package.json"))("sharp");

const NAVY = "#01285F";
const ORANGE = "#FE8002";

// Chữ A (đồ thị 1024x1024, vùng vẽ x 182–842, y 204–797) và ba bậc cam.
const MARK_BODY = `
  <path fill="${NAVY}" d="M205 712 L438 262 C468 204 556 204 586 262 L819 712 C842 755 814 797 764 797 L738 797 C712 797 694 784 684 764 L524 408 Q512 380 500 408 L340 764 C330 784 312 797 286 797 L260 797 C210 797 182 755 205 712 Z"/>
  <g fill="${ORANGE}" stroke="${ORANGE}" stroke-width="30" stroke-linejoin="round">
    <polygon points="512,478 493,513 531,513"/>
    <polygon points="468,573 556,573 572,617 452,617"/>
    <polygon points="431,677 593,677 630,777 394,777"/>
  </g>`;

const svgMark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-label="UELPATH">
  <title>UELPATH</title>${MARK_BODY}
</svg>
`;

// Biểu tượng tab: nền trắng bo góc để nhìn rõ cả trên thanh tab tối.
const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-label="UELPATH">
  <title>UELPATH</title>
  <rect width="1024" height="1024" rx="224" fill="#FFFFFF"/>
  <g transform="translate(512 512) scale(0.82) translate(-512 -500.5)">${MARK_BODY}
  </g>
</svg>
`;

// Wordmark: các chữ là nét dày đầu tròn (cao 319), chữ A dùng đúng logo.
const W = 78;
const H = W / 2;
const letters = `
  <g fill="none" stroke="${NAVY}" stroke-width="${W}" stroke-linecap="round" stroke-linejoin="round">
    <path d="M${H} ${H} V180 A100 100 0 0 0 239 180 V${H}"/>
    <path d="M349 ${H} V280 M349 ${H} H501 M349 156 H481 M349 280 H501"/>
    <path d="M597 ${H} V280 H733"/>
    <path d="M826 280 V${H} H925 A67.5 67.5 0 0 1 925 174 H826"/>
    <path d="M1314 ${H} H1496 M1405 ${H} V280"/>
    <path d="M1589 ${H} V280 M1788 ${H} V280 M1589 156 H1788"/>
  </g>
  <g transform="translate(887.1 -109.7) scale(0.538)">${MARK_BODY}
  </g>`;

const svgWordmarkTight = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1827 319" width="1827" height="319" role="img" aria-label="UELPATH">
  <title>UELPATH</title>${letters}
</svg>
`;

const svgWordmark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2000 667" width="2000" height="667" role="img" aria-label="UELPATH">
  <title>UELPATH</title>
  <g transform="translate(88 174)">${letters}
  </g>
</svg>
`;

const out = (...p) => path.join(root, ...p);
const write = (file, data) => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, data);
  console.log("ghi", path.relative(root, file));
};

const render = (svg, size, { background, density = 384 } = {}) => {
  let img = sharp(Buffer.from(svg), { density }).resize(size.w, size.h ?? size.w, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } });
  if (background) img = img.flatten({ background });
  return img;
};

// Bản logo cắt sát (bỏ lề trống) dùng cho các biểu tượng nhỏ.
const svgMarkTight = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="172 194 680 613">${MARK_BODY}</svg>`;

// Logo đặt giữa nền, chiếm `ratio` chiều rộng.
const onSquare = async (size, ratio, background) => {
  const inner = Math.round(size * ratio);
  const mark = await sharp(Buffer.from(svgMarkTight), { density: 384 }).resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  let img = sharp({ create: { width: size, height: size, channels: 4, background: background ?? { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: mark, gravity: "center" }]);
  return img;
};

// ---- SVG
write(out("web/public/brand/uelpath-mark.svg"), svgMark);
write(out("web/public/logo.svg"), svgMark);
write(out("web/src/app/icon.svg"), svgIcon);
write(out("web/public/brand/uelpath-wordmark-tight.svg"), svgWordmarkTight);
write(out("web/public/brand/uelpath-wordmark.svg"), svgWordmark);

// ---- Wordmark PNG/WebP (trong suốt)
for (const [name, svg, w, h] of [
  ["uelpath-wordmark-tight", svgWordmarkTight, 1827, 319],
  ["uelpath-wordmark", svgWordmark, 2000, 667],
]) {
  const buf = await render(svg, { w, h }).png().toBuffer();
  write(out(`web/public/brand/${name}.png`), buf);
  write(out(`web/public/brand/${name}.webp`), await sharp(buf).webp({ quality: 92, alphaQuality: 100 }).toBuffer());
}

// ---- Mark PNG (448, trong suốt, ngang bản cũ)
write(out("web/public/brand/uelpath-mark.png"), await render(svgMark, { w: 448 }).png().toBuffer());

// ---- Biểu tượng cài đặt app
write(out("web/public/icons/icon-192.png"), await (await onSquare(192, 0.9)).png().toBuffer());
write(out("web/public/icons/icon-512.png"), await (await onSquare(512, 0.9)).png().toBuffer());
const white = { r: 255, g: 255, b: 255, alpha: 1 };
// Maskable: nền trắng đặc, logo nằm gọn trong vùng an toàn 80%.
write(out("web/public/icons/icon-maskable-512.png"), await (await onSquare(512, 0.62, white)).flatten({ background: white }).png().toBuffer());
write(out("web/src/app/apple-icon.png"), await (await onSquare(180, 0.78, white)).flatten({ background: white }).png().toBuffer());

// ---- favicon.ico (16/32/48, PNG nhúng trong ICO)
const sizes = [16, 32, 48];
const pngs = [];
for (const s of sizes) {
  const inner = Math.round(s * 0.92);
  const mark = await sharp(Buffer.from(svgMarkTight), { density: 384 }).resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  pngs.push(await sharp({ create: { width: s, height: s, channels: 4, background: white } }).composite([{ input: mark, gravity: "center" }]).png().toBuffer());
}
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = 6 + 16 * sizes.length;
const entries = sizes.map((s, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(s, 0);
  e.writeUInt8(s, 1);
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(pngs[i].length, 8);
  e.writeUInt32LE(offset, 12);
  offset += pngs[i].length;
  return e;
});
write(out("web/src/app/favicon.ico"), Buffer.concat([header, ...entries, ...pngs]));
console.log("xong");
