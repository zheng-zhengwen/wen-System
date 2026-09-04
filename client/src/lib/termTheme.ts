/** 把 CSS 变量读成 xterm 能吃的主题对象。
 *
 *  xterm 的配色是 **JS 对象**，不是 CSS —— 它把字符画到 canvas 上，CSS 变量
 *  一个字都进不去。所以两个终端必须显式读取工作台的浅色令牌，避免出现黑色孤岛。
 *
 *  这里在**运行时**把当前琉璃·浅主题的 CSS 变量读出来喂给 xterm。
 *  变量取值一律从 `<html>` 上读 —— 那是 data-theme 挂的地方，也是所有主题变量
 *  真正生效的作用域。
 */

/** 读一个 CSS 变量并解析成 `#rrggbb`。xterm 只认十六进制或 rgb()，不认 var()。 */
function readColor(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!raw) return fallback;
  if (/^#[0-9a-f]{3,8}$/i.test(raw)) return raw;
  // rgb()/rgba()/color-mix() 一律交给浏览器算：挂一个临时元素读回计算值，
  // 比在这里手写一个 CSS 颜色解析器可靠得多。
  const probe = document.createElement("span");
  probe.style.cssText = `position:absolute;visibility:hidden;color:${raw}`;
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  const m = resolved.match(/([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/);
  if (!m) return fallback;
  const hex = (v: string) => Math.round(+v).toString(16).padStart(2, "0");
  return `#${hex(m[1])}${hex(m[2])}${hex(m[3])}`;
}

/** 带透明度的选中高亮。xterm 的 selectionBackground 支持 rgba。 */
function readRgba(name: string, alpha: number, fallback: string): string {
  const hex = readColor(name, "");
  if (!hex || hex.length < 7) return fallback;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},${alpha})`;
}

export type XtermTheme = {
  background: string;
  foreground: string;
  cursor: string;
  selectionBackground: string;
};

/** 当前琉璃·浅界面下的终端配色。 */
export function xtermTheme(): XtermTheme {
  return {
    background: readColor("--term-bg", "#e4e8ee"),
    foreground: readColor("--t", "#0f1115"),
    cursor: readColor("--acc", "#16a34a"),
    selectionBackground: readRgba("--acc", 0.25, "rgba(22,163,74,.25)"),
  };
}

/**
 * 完整的 ANSI 16 色。
 *
 * **不能只换 background/foreground 就完事**：ANSI 那 16 色是程序自己选的
 * （红=报错、绿=通过），终端只负责给出色值。把深色终端直接放到浅底上，
 * `white` 和 `brightWhite` 会变成白底白字 —— 看不见的不是装饰，是输出。
 *
 * 产品只保留浅色界面，因此终端始终使用 One Light ANSI 配色。
 */
export function xtermAnsi(): Record<string, string> | null {
  if (typeof document === "undefined") return null;
  return {
    // One Light keeps white output readable on the product's light surface.
    black: "#111111", red: "#c2402f", green: "#50a14f", yellow: "#986801",
    blue: "#4078f2", magenta: "#a626a4", cyan: "#0184bc", white: "#9c9c96",
    brightBlack: "#6e6e68", brightRed: "#d55b48", brightGreen: "#66b765",
    brightYellow: "#b07d0a", brightBlue: "#5b8ef5", brightMagenta: "#bd42ba",
    brightCyan: "#12a0d6", brightWhite: "#6e6e68",
  };
}
