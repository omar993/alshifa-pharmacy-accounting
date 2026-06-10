# Remix: Syrian Pharmacy Accounting Ledger - Maintenance & Release Guide

This document preserves the key architecture, installation, compilation, and future update workflows for the integration team and future AI coding agents.

---

## 🏗️ Technical Architecture & Ecosystem

- **Frontend Core**: React 19 + TypeScript + Vite.
- **Backend Service**: Express Server proxying local requests (Port 3000).
- **Desktop Shell**: Electron Wrapper (`electron-main.cjs`).
- **Database Storage**: Multi-engine dynamic adapter (`sqlite-adapter.ts`).
  - **Primary**: Native SQLite3 pointing to raw `.db` file in user's OS AppData folder.
  - **Fallback**: Robust OS-level persistent JSON files when native drivers are missing or building.

---

## 💾 Core Database Policy (Zero-Data-Loss on Update)

The application stores all pharmacy data (inventory, sales, invoices, app cache) inside the host system's user application data directory:
- **Windows**: `C:\Users\<username>\AppData\Roaming\RemixPharma\`
  - Database File: `syrian-pharma.db`
  - Fallback File: `syrian-pharma-db.json`
- **Linux/macOS**: `~/.config/RemixPharma/` or `~/Library/Preferences/RemixPharma/`

### ⚠️ Critical Rule for Release Engineers:
**Never bundle the active database with the program installer.** The installer file `RemixPharma.exe` simply installs the application code. It **never wipes, modifies, or deletes** the databases stored in `%APPDATA%\RemixPharma\`. 
This guarantees that **you can update the software safe in the knowledge that your inventory and accounting numbers remain untouched and perfectly preserved!**

---

## 🛠️ Step-by-Step Desktop Build & Packaging Instructions

Follow these exact steps to compile the application and generate a standalone Windows installer (`.exe`) that can be loaded into any laptop:

### 1. Install Project Dependencies (MANDATORY FIRST STEP)
Before running any configurations or builds, restore all NPM packages on your computer. Run this in the terminal:
```bash
npm install
```

### 2. Project Initialization & Repair
Verify that the local Electron wrapper binary structure is healthy and all native configurations are repaired:
```bash
node repair-electron.cjs
```

### 3. Standalone Code Compilation (Frontend + Server)
Compile Vite client assets into high-performance web modules, and package the Express server endpoint code into a Single, Self-Contained CommonJS file using esbuild to bypass Node's relative ESM import checks:
```bash
npm run build
```
*(Executes: `npx vite build && npx esbuild server.ts --bundle --platform=node --format=cjs --external:sqlite3 --sourcemap --outfile=dist/server.cjs`)*

### 4. Pack the Full Desktop Executable & Windows Installer
Compile the entire project into an installer using `electron-builder`:
```bash
npm run build:desktop
```
*(Executes: `electron-builder build --win`)*

- **Output Directory**: `dist-desktop/`
- **Output Files**:
  - `RemixPharma Setup <version>.exe`: A professional, user-friendly Windows setup program.
  - `RemixPharma-portable.exe`: Portable copy requiring no installation.

---

## 🔄 Future Update Deployment Masterclass (How to Deliver Updates)

When you make changes or updates to the source code, follow this seamless release pipeline to deliver changes to your clients' laptops:

1. **Change App Version**: Open `package.json` and change the `"version": "1.0.0"` property (e.g., `"version": "1.1.0"`).
2. **Build Installer**: Run the packaging command in the terminal:
   ```bash
   npm run build:desktop
   ```
3. **Distribute The Setup File**: Copy the new installer file generated in `dist-desktop/RemixPharma Setup 1.1.0.exe` and send it to the pharmacy's laptop via USB flash drive, email, or cloud link.
4. **Install on the Pharmacy Laptop**: 
   - Double-click the installer on the target laptop.
   - The setup agent will automatically replace old files and install the updated version.
   - **No Data Loss**: The newer software will inherit and connect automatically to the existing `%APPDATA%\RemixPharma\syrian-pharma.db` with absolute safety! All historical reports and stock files remain perfectly intact.
