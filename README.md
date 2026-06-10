# alshifa-pharmacy-accounting
"An integrated pharmaceutical accounting, POS, and inventory management system designed for  pharmacies, featuring React/Vite, Electron (Windows Desktop), an Android companion client, and secure local SQLite storage."
# Remix Pharma Ledger (Syrian Pharmacy Accounting & POS)

An enterprise-grade, integrated pharmaceutical inventory, accounting, and Point-of-Sale (POS) management suite custom-built for pharmacies in the Syrian Arab Republic. This software maintains a cross-platform design, providing a high-performance **Windows Desktop Shell** utilizing Electron and a integrated native **Android companion app**.

---

## 🏗️ Technical Architecture & Stack

### Frontend & App Core
- **Framework**: React 19 + TypeScript + Vite + Tailwind CSS.
- **Animations**: Framer Motion (`motion/react`).
- **Data Visualizations**: Recharts.

### Backend Proxy Server
- **Server**: Express Node.js application (compiled to a single, secure CJS bundle using `esbuild`).

### Database Engine (Hybrid & Resilient)
- **Primary Database**: Native SQLite3 pointing to the local system AppData directory.
- **Fallback Database**: Secure OS-level JSON file-based database adapter preventing data loss under all conditions.
- **Cloud Sync & Services**: Firebase Authentication and Cloud Firestore for optional real-time cloud data backup.

### Target Enclosures
- **Desktop**: Electron Desktop integration wrapping the high-performance local server.
- **Mobile**: Native Kotlin/Java Android framework integrated via the Gradle multi-module structure (`/android`).

---

## 🛡️ Security & Privacy Notice (Critical)

To safeguard production systems, database files and custom access credentials **must never** be uploaded to the public GitHub repository. This codebase is fully configured to respect privacy by default:

1. **Local Storage Policy**: The application's database (`syrian-pharma.db` & JSON fallbacks) is stored exclusively in the host system's secure user-data folder (e.g., `%APPDATA%/RemixPharma/` on Windows or `~/.config/RemixPharma/` on Linux). This directory is never included in the repository, guaranteeing absolute security for customer accounts and inventory values.
2. **Ignored Variables**: Sensitive configuration files such as `.env`, system environment variables, Firebase configurations (`firebase-applet-config.json`), and custom keystores are excluded from version control via `.gitignore`.
3. **Template Setup**: If you clone this repository, you should duplicate the `.env.example` file and rename it to `.env`, placing your custom backend keys/variables inside it.

---

## 🛠️ Step-by-Step Desktop Build Instructions

Deploying build updates safely onto client machines consists of creating isolated, self-contained installation binaries:

### 1. Install Dependencies
Restore all node modules and target runtime configurations:
```bash
npm install
