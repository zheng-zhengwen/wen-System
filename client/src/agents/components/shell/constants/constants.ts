import type { ITerminalOptions } from '@xterm/xterm';

export const CODEX_DEVICE_AUTH_URL = 'https://auth.openai.com/codex/device';
export const SHELL_RESTART_DELAY_MS = 200;
export const TERMINAL_INIT_DELAY_MS = 100;
export const TERMINAL_RESIZE_DELAY_MS = 50;

// CLI prompt overlay detection
export const PROMPT_DEBOUNCE_MS = 500;
export const PROMPT_BUFFER_SCAN_LINES = 20;
export const PROMPT_OPTION_SCAN_LINES = 15;
export const PROMPT_MAX_OPTIONS = 5;
export const PROMPT_MIN_OPTIONS = 2;

export const TERMINAL_OPTIONS: ITerminalOptions = {
  cursorBlink: true,
  fontSize: 14,
  fontFamily: 'Menlo, Monaco, "Courier New", monospace',
  allowProposedApi: true,
  allowTransparency: false,
  convertEol: true,
  scrollback: 10000,
  tabStopWidth: 4,
  windowsMode: false,
  macOptionIsMeta: true,
  macOptionClickForcesSelection: true,
  // Keep a complete light fallback for browsers that cannot read CSS tokens.
  theme: {
    background: '#e4e8ee',
    foreground: '#0f1115',
    cursor: '#16a34a',
    cursorAccent: '#ffffff',
    selectionBackground: 'rgba(22,163,74,.25)',
    selectionForeground: '#0f1115',
    black: '#111111',
    red: '#c2402f',
    green: '#50a14f',
    yellow: '#986801',
    blue: '#4078f2',
    magenta: '#a626a4',
    cyan: '#0184bc',
    white: '#9c9c96',
    brightBlack: '#6e6e68',
    brightRed: '#d55b48',
    brightGreen: '#66b765',
    brightYellow: '#b07d0a',
    brightBlue: '#5b8ef5',
    brightMagenta: '#bd42ba',
    brightCyan: '#12a0d6',
    brightWhite: '#6e6e68',
    extendedAnsi: [
      '#111111',
      '#c2402f',
      '#50a14f',
      '#986801',
      '#4078f2',
      '#a626a4',
      '#0184bc',
      '#9c9c96',
      '#6e6e68',
      '#d55b48',
      '#66b765',
      '#b07d0a',
      '#5b8ef5',
      '#bd42ba',
      '#12a0d6',
      '#6e6e68',
    ],
  },
};
