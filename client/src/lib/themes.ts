/** 主题注册表 —— 全站唯一一处。当前产品只提供琉璃·浅。 */

export type ThemeMode = "light" | "dark";

export type ThemeDef = {
  /** `<html data-theme>` 的值，也是 localStorage 里存的值 */
  id: string;
  /** 中文名，用在选择器和设置页 */
  name: string;
  /** 字符图标。用字符不用 SVG——整套界面的语汇就是等宽字符与线条 */
  icon: string;
  /** 选择器上那颗圆点的颜色。**必须等于 CSS 里该主题的 `--acc`** */
  accent: string;
  /**
   * 明暗。agents 子树靠它决定加不加 `.dark`、代码高亮选哪套。
   *
   * 以前是 `theme !== 'light'` 猜的——只要再加一套浅色主题就会被误判成深色，
   * 表现为「HSL 变量已经是浅色、`.dark` 还挂着」的撕裂。
   */
  mode: ThemeMode;
};

export const THEMES: readonly ThemeDef[] = [
  { id: "lucent-light",  name: "琉璃·浅", icon: "◌", accent: "#16a34a", mode: "light" },
];

/**
 * 新用户和旧主题用户都统一落到琉璃·浅。
 */
export const DEFAULT_THEME = "lucent-light";

/** localStorage 键。写在这里，免得四个启动路径各拼一遍字符串。 */
export const THEME_KEY = "awenops.theme";
/**
 * 迁移版本号。**只有它缺席时才动用户已存的主题**，所以这次迁移一辈子只跑一次；
 * 用户之后手动选的任何主题都不会再被覆盖。
 */
const MIGRATION_KEY = "awenops.theme.v";
const MIGRATION = "4";

/**
 * 旧版本可能把任意已删除主题写在 localStorage 中。迁移一次并清理为唯一主题，
 * 同时保留返回值供启动路径决定是否提示用户。
 *
 * @returns 是否发生了迁移（调用方据此决定要不要提示）
 */
export function migrateTheme(): boolean {
  try {
    if (localStorage.getItem(MIGRATION_KEY) === MIGRATION) return false;
    localStorage.setItem(MIGRATION_KEY, MIGRATION);
    const current = localStorage.getItem(THEME_KEY);
    // 没存过 = 新用户，直接吃默认值，不必提示
    if (!current || current === DEFAULT_THEME) return false;
    localStorage.setItem(THEME_KEY, DEFAULT_THEME);
    return true;
  } catch {
    return false;   // 隐私模式下 localStorage 会抛，静默放弃即可
  }
}

const BY_ID = new Map(THEMES.map((t) => [t.id, t]));

export function isThemeId(value: unknown): value is string {
  return typeof value === "string" && BY_ID.has(value);
}

/** 认不出的 id 一律回落默认主题，绝不返回 undefined —— 调用方遍布启动路径。 */
export function getTheme(id: string | null | undefined): ThemeDef {
  return (id && BY_ID.get(id)) || BY_ID.get(DEFAULT_THEME)!;
}

export function themeMode(id: string | null | undefined): ThemeMode {
  return getTheme(id).mode;
}

/** 选择器上那一行：图标 + 中文名。 */
export function themeLabel(id: string): string {
  const t = getTheme(id);
  return `${t.icon} ${t.name}`;
}

/**
 * 主题的配色和形状都是琉璃·浅的固定组合。
 */
export function themeSkin(_id: string | null | undefined): "lucent" {
  return "lucent";
}

/** 把主题的两个维度一次打到 <html> 上。启动路径和切换路径共用，避免只改一半。 */
export function applyThemeAttrs(id: string): void {
  const theme = getTheme(id);
  const root = document.documentElement;
  root.setAttribute("data-theme", theme.id);
  root.setAttribute("data-skin", "lucent");
  // 让浏览器自带控件（滚动条、表单、日期选择器）也跟着走。少了它，
  // 浅色主题上会冒出一条深色滚动条。
  root.style.colorScheme = theme.mode;
}
