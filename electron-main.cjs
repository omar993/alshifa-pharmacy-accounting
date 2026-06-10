/**
 * Syrian Pharmacy Accounting Ledger - local desktop wrap launcher
 * Powered by Electron & local Express Backend proxy
 */

const { app, BrowserWindow, Menu, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");

let mainWindow = null;
let serverProcess = null;

// Ensure only a single instance of the pharmacy system runs at once
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // Start the background local database and Express server
  function startLocalServer() {
    try {
      console.log("[Electron-Boot] Invoking inline local Express DB server backend...");
      
      // In production mode, we require the compiled Express server bundle.
      // In development mode, we can point to local compiled server files.
      const compiledServerPath = path.join(__dirname, "dist", "server.cjs");
      const devServerPath = path.join(__dirname, "server.ts");

      if (fs.existsSync(compiledServerPath)) {
        process.env.NODE_ENV = "production";
        require(compiledServerPath);
        console.log("[Electron-Boot] Production server bundle mounted successfully.");
      } else if (fs.existsSync(devServerPath)) {
        console.log("[Electron-Boot] Production server not compiled. Booting dynamic tsx dev server fallback...");
        const { spawn } = require("child_process");
        const exeCmd = process.platform === "win32" ? "npx.cmd" : "npx";
        serverProcess = spawn(exeCmd, ["tsx", "server.ts"], {
          stdio: "inherit",
          shell: true,
          env: { ...process.env, NODE_ENV: "development" }
        });
        serverProcess.on("exit", () => {
          app.isQuitting = true;
          app.quit();
        });
        console.log("[Electron-Boot] Dev server background process spawned successfully.");
      } else {
        console.log(`[Electron-Boot] Production server not compiled and server.ts missing.`);
      }
    } catch (e) {
      console.error("[Electron-Boot] Critical backend initialization failure:", e);
      dialog.showErrorBox(
        "خطأ في تهيئة النظام المحاسبي",
        "فشل النظام في تشغيل خادم مجمع البيانات المدمج. يرجى إعادة تشغيل البرنامج كمسؤول (Administrator).\n" + e.message
      );
    }
  }

  function createWindow() {
    mainWindow = new BrowserWindow({
      width: 1280,
      height: 800,
      minWidth: 1024,
      minHeight: 768,
      title: "Remix: نظام محاسبة الصيدلية المتكامل",
      show: false, // Don't show until page is fully prepared
      backgroundColor: "#f8fafc",
      icon: path.join(__dirname, "build", "icon.ico"), // standard Windows icon location
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true
      }
    });

    // Explicitly set User-Agent to contain Electron/RemixPharma to avoid detection failure
    mainWindow.webContents.setUserAgent(mainWindow.webContents.getUserAgent() + " Electron/RemixPharma");

    // Custom Professional Minimalist Arabic Dashboard menu
    const isMac = process.platform === "darwin";
    const template = [
      {
        label: "البرنامج",
        submenu: [
          { label: "إعادة تشغيل النظام", role: "reload" },
          { label: "تكبير ملء الشاشة", role: "togglefullscreen" },
          { type: "separator" },
          { label: "إغلاق البرنامج", click() { if (mainWindow) { mainWindow.close(); } } }
        ]
      },
      {
        label: "الدعم والمساعدة",
        submenu: [
          {
            label: "مجلد الحفظ المحلي (AppData)",
            click() {
              const baseDir = process.env.APPDATA || path.join(process.env.HOME || "", ".config");
              const appDir = path.join(baseDir, "RemixPharma");
              require("electron").shell.openPath(appDir);
            }
          },
          {
            label: "أدوات مطور النظام (DevTools)",
            accelerator: "F12",
            click() {
              if (mainWindow) {
                mainWindow.webContents.toggleDevTools();
              }
            }
          },
          { type: "separator" },
          {
            label: "حول نظام ريمكس الصيدلاني سورية",
            click() {
              dialog.showMessageBox(mainWindow, {
                type: "info",
                title: "حول النظام",
                message: "ريمكس محاسبة الصيدليات المتكامل v2.5",
                detail: "برنامج وطني مستقل للأجهزة المحلية، مجهز بقواعد جرد مدمجة، وفحص تلقائي وتفاعلي لتسعيرة الدواء وقرارات وزارة الصحة السورية لعام 2026.\nتطوير وتفعيل: Gemini AI Studio.",
                buttons: ["موافق"]
              });
            }
          }
        ]
      }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);

    // Hide the desktop menu bar by default for a clean frameless feel, toggleable via Alt key
    mainWindow.setAutoHideMenuBar(true);
    mainWindow.setMenuBarVisibility(false);

    // 1. Initial visual loading screen configuration
    const loadingHTML = `
      <html dir="rtl">
        <head>
          <meta charset="utf-8">
          <style>
            body {
              font-family: system-ui, -apple-system, sans-serif;
              background-color: #0f172a;
              color: #f1f5f9;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              height: 100vh;
              margin: 0;
              text-align: center;
            }
            .loader {
              border: 4px solid #334155;
              border-top: 4px solid #3b82f6;
              border-radius: 50%;
              width: 50px;
              height: 50px;
              animation: spin 1s linear infinite;
              margin-bottom: 25px;
            }
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
            h2 { font-weight: 500; font-size: 18px; color: #3b82f6; margin: 0; }
            p { color: #94a3b8; font-size: 14px; margin-top: 8px; }
          </style>
        </head>
        <body>
          <div class="loader"></div>
          <h2>جاري تشغيل خادم نظام ريمكس الصيدلاني...</h2>
          <p>الرجاء الانتظار، يتم فحص قواعد البيانات وتحضير واجهة المستخدم المحلية</p>
        </body>
      </html>
    `;

    mainWindow.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(loadingHTML));

    // 2. Self-healing HTTP health-check polling with increased timeout and robust endpoints
    let checkAttempts = 0;
    const maxAttempts = 120; // Increased to 120 attempts (up to 120 seconds of fallback boot buffer)

    function checkServerOnline(callback) {
      // 1. Try dedicated lightweight health endpoint
      http.get("http://localhost:3000/api/health", (res) => {
        if (res.statusCode === 200) {
          callback(true);
        } else {
          // 2. Fallback to details path
          http.get("http://localhost:3000/api/db/details", (res2) => {
            callback(res2.statusCode === 200);
          }).on("error", () => {
            callback(false);
          });
        }
      }).on("error", () => {
        // 3. Direct details fallback in case /api/health is completely unreachable
        http.get("http://localhost:3000/api/db/details", (res2) => {
          callback(res2.statusCode === 200);
        }).on("error", () => {
          callback(false);
        });
      });
    }

    function showFailurePage() {
      mainWindow.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(`
        <html dir="rtl">
          <head>
            <meta charset="utf-8">
            <style>
              body {
                font-family: system-ui, -apple-system, sans-serif;
                background-color: #f8fafc;
                color: #1e293b;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                height: 100vh;
                margin: 0;
                padding: 20px;
                text-align: center;
              }
              .card {
                background: white;
                padding: 30px;
                border-radius: 12px;
                box-shadow: 0 4px 15px rgba(0,0,0,0.05);
                max-width: 500px;
                border-top: 5px solid #ef4444;
              }
              h1 { color: #dc2626; font-size: 20px; margin-top: 0; }
              p { font-size: 14px; line-height: 1.6; color: #475569; }
              code { background: #e2e8f0; padding: 3px 6px; border-radius: 4px; font-family: monospace; font-size: 13px; }
              .steps { text-align: right; margin: 20px 0; font-size: 14px; line-height: 1.8; color: #334155; }
              button {
                background: #2563eb; color: white; border: none; padding: 10px 24px;
                border-radius: 6px; cursor: pointer; font-weight: bold; margin-top: 15px;
                font-size: 14px; transition: background 0.2s;
              }
              button:hover { background: #1d4ed8; }
            </style>
          </head>
          <body>
            <div class="card">
              <h1>⚠️ عذراً، لم يتمكن البرنامج من الاتصال بالخادم الداخلي</h1>
              <p>تستغرق عملية التشغيل وقتاً أطول من المعتاد، أو أن المنفذ 3000 محجوز لبرنامج آخر في الخلفية.</p>
              <div class="steps">
                1. تأكد من إغلاق أي برنامج آخر قد يمنع استخدام منفذ الاتصالات 3000.<br>
                2. افتح منفذ الأوامر (Terminal) في مجلد المشروع <code>C:\\RemixPharma</code> ونفذ أمر البناء:<br>
                &nbsp;&nbsp;&nbsp;<strong><code>npm run build</code></strong><br>
                3. أعد تشغيل البرنامج بوضع التطوير المباشر والآمن بالكامل:<br>
                &nbsp;&nbsp;&nbsp;<strong><code>npm run dev:electron</code></strong>
              </div>
              <button onclick="window.location.reload()">إعادة المحاولة الآن</button>
            </div>
          </body>
        </html>
      `));
    }

    function pollServer() {
      if (!mainWindow) return;
      checkServerOnline((online) => {
        if (online) {
          console.log("[Electron-Boot] Local Express server is healthy and online! Redirecting client dashboard...");
          mainWindow.loadURL("http://localhost:3000").catch((err) => {
            console.error("[Electron-Boot] Redirect failed, retrying...", err);
            setTimeout(pollServer, 1000);
          });
        } else {
          checkAttempts++;
          if (checkAttempts < maxAttempts) {
            console.log(`[Electron-Boot] Waiting for internal Express server to initialize... Attempt (${checkAttempts}/${maxAttempts})`);
            setTimeout(pollServer, 1000);
          } else {
            console.error("[Electron-Boot] Internal backend did not boot successfully within 120 seconds.");
            showFailurePage();
          }
        }
      });
    }

    // Initiate polling loop
    setTimeout(pollServer, 500);

    // Optional did-fail-load safety belt for subsequent page links
    mainWindow.webContents.on("did-fail-load", (event, errorCode, errorDescription, validatedURL) => {
      if (validatedURL.startsWith("http://localhost:3000")) {
        console.error(`[Electron-Boot] Connection error: ${errorDescription} (${errorCode})`);
        showFailurePage();
      }
    });

    mainWindow.once("ready-to-show", () => {
      mainWindow.show();
      // Auto-open devtools in non-packaged development phase
      if (!app.isPackaged) {
        mainWindow.webContents.openDevTools();
      }
    });

    mainWindow.on("close", (e) => {
      if (!app.isQuitting) {
        e.preventDefault();
        mainWindow.webContents.executeJavaScript(
          "typeof window.triggerAppExitFlow === 'function'"
        ).then((hasTrigger) => {
          if (hasTrigger) {
            mainWindow.webContents.executeJavaScript("window.triggerAppExitFlow()");
          } else {
            app.isQuitting = true;
            mainWindow.close();
          }
        }).catch(() => {
          app.isQuitting = true;
          mainWindow.close();
        });
      }
    });

    mainWindow.on("closed", () => {
      mainWindow = null;
    });
  }

  // Lifecycle bindings
  app.whenReady().then(() => {
    startLocalServer();
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (serverProcess) {
      try {
        serverProcess.kill();
      } catch (e) {}
    }
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  app.on("quit", () => {
    if (serverProcess) {
      try {
        serverProcess.kill();
      } catch (e) {}
    }
  });
}
