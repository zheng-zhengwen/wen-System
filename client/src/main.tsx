import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
// 先加载唯一主题令牌，再加载工作台通用样式，保证所有组件读到同一套浅色变量。
import "./styles/lucent-tokens.css";
import "./styles/workbench.css";
// 形状层最后引入：它们靠 !important 压过通用样式，顺序也是生效契约。
import "./styles/lucent-base.css";
import "./styles/lucent-skin.css";
import { applyAppearance } from "./lib/appearance";
import { DEFAULT_THEME, THEME_KEY, applyThemeAttrs, isThemeId, migrateTheme } from "./lib/themes";

// 挂载前先把主题打上，避免先画错一帧再翻过来。
//
// data-skin 与 data-theme 必须在挂载前同步写入，避免首帧落到错误的形状层。
// 一次性迁移在读取之前运行，把历史主题设置统一归一到琉璃·浅。
// 迁移只在这台浏览器第一次跑到这行时发生一次，之后手动选的主题不会被碰。
void migrateTheme();
const saved = localStorage.getItem(THEME_KEY);
applyThemeAttrs(isThemeId(saved) ? saved : DEFAULT_THEME);

// Apply persisted appearance (user font override + global zoom) before mount,
// same reason as theme — avoid a flash of the wrong font/size.
applyAppearance();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
