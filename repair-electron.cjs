const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const { execSync } = require("child_process");

const electronDir = path.join(__dirname, "node_modules", "electron");
const pathFile = path.join(electronDir, "path.txt");
const distDir = path.join(electronDir, "dist");
const packageFile = path.join(electronDir, "package.json");
const indexFile = path.join(electronDir, "index.js");
const cliFile = path.join(electronDir, "cli.js");

console.log("=== Electron Setup Repair Tool ===");
console.log(`Working directory: ${__dirname}`);

// Check if electron node_modules folder exists, if not construct it
if (!fs.existsSync(electronDir)) {
  console.log("⚠️ node_modules/electron folder was not found! Creating it...");
  fs.mkdirSync(electronDir, { recursive: true });
}

// Dynamically resolve Electron version from package.json
let version = "31.0.2"; // default fallback
try {
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8"));
  let rawVersion = (packageJson.optionalDependencies && packageJson.optionalDependencies.electron) ||
                   (packageJson.devDependencies && packageJson.devDependencies.electron) ||
                   (packageJson.dependencies && packageJson.dependencies.electron);
  if (rawVersion) {
    version = rawVersion.replace(/[^0-9.]/g, "");
  }
} catch (e) {
  console.log("⚠️ Could not read package.json, using fallback version v31.0.2");
}

console.log(`Targeting Electron version: v${version}`);

// Expected executable name
const expectedExeName = process.platform === "win32" ? "electron.exe" : "electron";
const exePath = path.join(distDir, expectedExeName);

// 1. Generate standard package files if missing or dirty
function ensureWrapperFiles() {
  console.log("Checking and generating standard NPM packaging wrapper scripts...");
  
  const pkgContent = {
    "name": "electron",
    "version": version,
    "description": "Build cross platform desktop apps with JavaScript, HTML, and CSS",
    "main": "index.js",
    "types": "electron.d.ts",
    "bin": {
      "electron": "cli.js"
    },
    "license": "MIT"
  };

  const indexContent = `const fs = require('fs');
const path = require('path');

const pathFile = path.join(__dirname, 'path.txt');

function getElectronPath () {
  let executablePath;
  if (fs.existsSync(pathFile)) {
    executablePath = fs.readFileSync(pathFile, 'utf-8').trim();
  }
  if (process.env.ELECTRON_OVERRIDE_DIST_PATH) {
    return path.join(process.env.ELECTRON_OVERRIDE_DIST_PATH, executablePath || '${expectedExeName}');
  }
  if (executablePath) {
    return path.join(__dirname, 'dist', executablePath);
  } else {
    throw new Error('Electron failed to install correctly, please delete node_modules/electron and try installing again');
  }
}

module.exports = getElectronPath();
`;

  const cliContent = `#!/usr/bin/env node

const electron = require('./');
const proc = require('child_process');

const child = proc.spawn(electron, process.argv.slice(2), { stdio: 'inherit', windowsHide: false });
child.on('close', function (code, signal) {
  if (code === null) {
    console.error(electron, 'exited with signal', signal);
    process.exit(1);
  }
  process.exit(code);
});

const handleTerminationSignal = function (signal) {
  process.on(signal, function signalHandler () {
    if (!child.killed) {
      child.kill(signal);
    }
  });
};

handleTerminationSignal('SIGINT');
handleTerminationSignal('SIGTERM');
`;

  fs.writeFileSync(packageFile, JSON.stringify(pkgContent, null, 2), "utf8");
  fs.writeFileSync(indexFile, indexContent, "utf8");
  fs.writeFileSync(cliFile, cliContent, "utf8");
  fs.writeFileSync(pathFile, expectedExeName, "utf8");
  console.log("✅ Wrapper files (package.json, index.js, cli.js, path.txt) written perfectly!");
}

// Check if EVERYTHING is healthy
const wrapperHealthy = fs.existsSync(packageFile) && fs.existsSync(indexFile) && fs.existsSync(cliFile) && fs.existsSync(pathFile);
const exeHealthy = fs.existsSync(exePath);

if (wrapperHealthy && exeHealthy) {
  const currentPathVal = fs.readFileSync(pathFile, "utf8").trim();
  if (currentPathVal.includes("dist") || currentPathVal !== expectedExeName) {
    console.log("⚠️ Fixing wrong path.txt value...");
    fs.writeFileSync(pathFile, expectedExeName, "utf8");
  }
  console.log("🎉 All Electron components (executable, wrappers, path.txt) are healthy!");
  process.exit(0);
}

// Ensure wrapper files are written first
ensureWrapperFiles();

if (exeHealthy) {
  console.log("🎉 Native Electron executable already exists! Wrapper files recreated, we are good!");
  process.exit(0);
}

console.log("⚠️ Native Electron executable is missing.");
console.log("Preparing to automatically download and install Electron from Alibaba Mirror CDN...");

// Resolve platform and architecture
let osStr = "";
if (process.platform === "win32") {
  osStr = "win32";
} else if (process.platform === "darwin") {
  osStr = "darwin";
} else if (process.platform === "linux") {
  osStr = "linux";
} else {
  console.error(`❌ Unsupported platform: ${process.platform}`);
  process.exit(1);
}

let archStr = "";
if (process.arch === "x64") {
  archStr = "x64";
} else if (process.arch === "arm64") {
  archStr = "arm64";
} else if (process.arch === "ia32") {
  archStr = "ia32";
} else {
  // Try to fallback to x64
  archStr = "x64";
}

const fileSuffix = `${osStr}-${archStr}`;
const zipFileName = `electron-v${version}-${fileSuffix}.zip`;
const downloadUrl = `https://npmmirror.com/mirrors/electron/v${version}/${zipFileName}`;
const tempZipPath = path.join(electronDir, "electron.zip");

console.log(`Downloading: ${downloadUrl}`);
console.log(`Temporary zip destination: ${tempZipPath}`);

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    
    function get(currentUrl) {
      console.log(`Fetching: ${currentUrl}`);
      const client = currentUrl.startsWith("https") ? https : http;
      client.get(currentUrl, (response) => {
        // Handle redirections cleanly
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          let redirectUrl = response.headers.location;
          if (!redirectUrl.startsWith("http")) {
            const parsedUrl = new URL(currentUrl);
            redirectUrl = parsedUrl.origin + redirectUrl;
          }
          get(redirectUrl);
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Server returned status code ${response.statusCode}`));
          return;
        }

        const totalBytes = parseInt(response.headers['content-length'] || "0", 10);
        let downloadedBytes = 0;
        let lastReported = Date.now();

        response.on("data", (chunk) => {
          downloadedBytes += chunk.length;
          const now = Date.now();
          if (now - lastReported > 1500) {
            const percent = totalBytes ? ((downloadedBytes / totalBytes) * 100).toFixed(1) : "?";
            const mbDownloaded = (downloadedBytes / (1024 * 1024)).toFixed(1);
            console.log(`[Progress] Downloaded ${mbDownloaded} MB (${percent}%)`);
            lastReported = now;
          }
        });

        response.pipe(file);

        file.on("finish", () => {
          file.close();
          resolve();
        });
      }).on("error", (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    }

    get(url);
  });
}

function unzip(zipPath, destDir) {
  console.log(`Extracting Archive to: ${destDir}`);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  if (process.platform === "win32") {
    // Check if powershell is available to expand-archive
    try {
      console.log("Executing PowerShell Expand-Archive command...");
      const escapedZip = zipPath.replace(/'/g, "''");
      const escapedDest = destDir.replace(/'/g, "''");
      execSync(`powershell -NoProfile -Command "Expand-Archive -Path '${escapedZip}' -DestinationPath '${escapedDest}' -Force"`, { stdio: "inherit" });
      console.log("✅ Extraction completed successfully using PowerShell.");
      return;
    } catch (psErr) {
      console.warn("⚠️ PowerShell extraction failed. Falling back to tar...", psErr.message);
    }

    // Try native command-line tar
    try {
      console.log("Executing native tar command...");
      execSync(`tar -xf "${zipPath}" -C "${destDir}"`, { stdio: "inherit" });
      console.log("✅ Extraction completed successfully using tar.");
      return;
    } catch (tarErr) {
      console.error("❌ Extraction failed with both PowerShell and tar.");
      throw tarErr;
    }
  } else {
    // macOS or Linux unzip
    try {
      execSync(`unzip -o "${zipPath}" -d "${destDir}"`, { stdio: "inherit" });
      console.log("✅ Extraction completed successfully via unzip.");
    } catch (unzipErr) {
      try {
        execSync(`tar -xf "${zipPath}" -C "${destDir}"`, { stdio: "inherit" });
        console.log("✅ Extraction completed successfully via tar.");
      } catch (tarErr) {
        throw new Error(`Failed to extract using unzip and tar: ${tarErr.message}`);
      }
    }
  }
}

async function run() {
  try {
    await downloadFile(downloadUrl, tempZipPath);
    console.log("✅ Download complete! Starting extraction...");

    // Remove any incomplete old dist folder before unzipping
    if (fs.existsSync(distDir)) {
      try {
        fs.rmSync(distDir, { recursive: true, force: true });
      } catch (e) {
        console.log("⚠️ Could not remove existing dist folder, continuing...");
      }
    }

    unzip(tempZipPath, distDir);

    // Write path.txt file required by electron package structure
    fs.writeFileSync(pathFile, expectedExeName, "utf8");
    console.log(`✅ Successfully generated path.txt with value: "${expectedExeName}"`);

    // Clean up temporary zip
    try {
      fs.unlinkSync(tempZipPath);
      console.log("🧹 Cleaned up temporary zip file.");
    } catch (cleanupErr) {
      console.log("⚠️ Minor warning: Temporary zip cleanup failed:", cleanupErr.message);
    }

    console.log("\n🎉 Electron setup is REPAIRED successfully! Ready to run.");
  } catch (err) {
    console.error("\n❌ Setup FAILED:", err.message);
    console.error("Please ensure you are connected to the internet and try running it again.");
    process.exit(1);
  }
}

run();
