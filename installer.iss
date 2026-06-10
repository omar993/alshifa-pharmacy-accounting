; =====================================================================
; Inno Setup Compiler Script for Syrian Pharmacy integrated Ledger (.EXE)
; =====================================================================
; This ISS script bundles the standalone packaged Electron distribution folder
; into a pristine, single-file Windows Installer wizard with local database configs.

#define AppName "نظام ريمكس لمحاسبة الصيدليات"
#define AppVersion "2.5.0"
#define AppPublisher "Remix Software"
#define AppExeName "RemixPharma.exe"

[Setup]
; Unique App ID (generated for robust registry references)
AppId={{D1A25B3E-B39C-4CD8-87C2-113EFB09CDFA}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#Publisher}
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
; Require folder selection
DisableProgramGroupPage=yes
; Specify layout colors and branding
DisableWelcomePage=no
WizardStyle=modern
UninstallDisplayIcon={app}\{#AppExeName}
SetupIconFile=build\icon.ico
SolidCompression=yes
Compression=lzma2/max
OutputBaseFilename=RemixPharma_Setup_v2.5
OutputDir=dist-installer

[Languages]
Name: "arabic"; MessagesFile: "compiler:Languages\Arabic.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
; Source path points to the electron output directory compiled via 'npm run package:win'
Source: "dist\win-unpacked\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExeName}"
Name: "{group}\إلغاء التثبيت"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"; Tasks: desktopicon

[Run]
Description: "تشغيل برنامج الصيدلية الآن"; Filename: "{app}\{#AppExeName}"; Flags: nowait postinstall skipifsilent

[Code]
// Script block to check if the target computer has active system prerequisites or database runtimes.
// Since we have packaged Express + SQLite as a standalone zero-dependency binary inside Electron,
// NO complex third-party prerequisites (like Java, local SQL engines, or Python) are strictly required!
function InitializeSetup(): Boolean;
begin
  Result := True;
end;
