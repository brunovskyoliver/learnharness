/** Test harness for scripts/check-electron-shell.mjs, never shipped. The real shell, with
 * two allowances for a machine with no display: BrowserWindow.show crashes Electron's
 * --headless mode, so it does nothing, and an unpacked run has no Resources folder, so
 * LH_TEST_RESOURCES names one. Everything else is electron/main.cjs as it ships. */
const { BrowserWindow } = require("electron");
for (const name of ["show", "focus", "maximize"]) BrowserWindow.prototype[name] = function skipped() {};
if (process.env.LH_TEST_RESOURCES) Object.defineProperty(process, "resourcesPath", { value: process.env.LH_TEST_RESOURCES });
require("../electron/main.cjs");
