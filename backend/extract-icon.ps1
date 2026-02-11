param (
    [string]$Target
)

$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

# P/Invoke definitions for High Resolution Icons
$Signature = @"
using System;
using System.Runtime.InteropServices;
using System.Drawing;

public class IconExtractor {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
    public struct SHFILEINFO {
        public IntPtr hIcon;
        public int iIcon;
        public uint dwAttributes;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]
        public string szDisplayName;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 80)]
        public string szTypeName;
    }

    [ComImport]
    [Guid("46EB5926-582E-4017-9FDF-E8998DAA0950")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IImageList {
        [PreserveSig] int GetIcon(int i, int flags, out IntPtr picon);
    }

    [DllImport("shell32.dll", CharSet = CharSet.Auto)]
    public static extern IntPtr SHGetFileInfo(string pszPath, uint dwFileAttributes, ref SHFILEINFO psfi, uint cbFileInfo, uint uFlags);

    [DllImport("shell32.dll", EntryPoint = "#727")]
    public static extern int SHGetImageList(int iImageList, ref Guid riid, out IImageList ppv);

    public const uint SHGFI_SYSICONINDEX = 0x4000;
    public const int SHIL_JUMBO = 0x4;
    public const int SHIL_EXTRALARGE = 0x2;

    public static Icon GetJumboIcon(string path) {
        SHFILEINFO shfi = new SHFILEINFO();
        IntPtr res = SHGetFileInfo(path, 0, ref shfi, (uint)Marshal.SizeOf(shfi), SHGFI_SYSICONINDEX);
        if (res == IntPtr.Zero) return null;

        Guid iid = new Guid("46EB5926-582E-4017-9FDF-E8998DAA0950");
        IImageList iml;
        int hres = SHGetImageList(SHIL_JUMBO, ref iid, out iml);
        if (hres != 0) return null;

        IntPtr hIcon;
        iml.GetIcon(shfi.iIcon, 1, out hIcon); // 1 = ILD_TRANSPARENT
        if (hIcon == IntPtr.Zero) return null;

        return Icon.FromHandle(hIcon);
    }
}
"@
Add-Type -TypeDefinition $Signature -ReferencedAssemblies System.Drawing

function Get-Base64Icon {
    param ([string]$Path)
    if (-not (Test-Path $Path)) { return $null }
    
    try {
        # Check if it's a PNG file - load directly
        if ($Path -match '\.png$') {
            $bytes = [System.IO.File]::ReadAllBytes($Path)
            $base64 = [Convert]::ToBase64String($bytes)
            return "data:image/png;base64,$base64"
        }
        
        # Try High-Res Extraction first
        $icon = [IconExtractor]::GetJumboIcon($Path)
        
        # Fallback if Jumbo fails
        if (-not $icon) {
            $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($Path)
        }

        if ($icon) {
            $bitmap = $icon.ToBitmap()
            
            # PROPORTION FIX: 
            # To match Lucide icons (which are strokes and usually have internal padding),
            # we can slightly pad the bitmap if it's a full square to make it feel the same size.
            # However, standard high-res icons (256x256) usually have their own margins.
            
            $stream = New-Object System.IO.MemoryStream
            $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
            $bytes = $stream.ToArray()
            $base64 = [Convert]::ToBase64String($bytes)
            $stream.Close(); $stream.Dispose(); $bitmap.Dispose(); $icon.Dispose()
            return "data:image/png;base64,$base64"
        }
    } catch {}
    return $null
}

function Get-UWPIconFromPackage {
    param ([string]$PackageFamilyName)
    
    $pkg = Get-AppxPackage | Where-Object { $_.PackageFamilyName -eq $PackageFamilyName }
    if (-not $pkg) { return $null }

    $installPath = $pkg.InstallLocation
    $manifestPath = Join-Path $installPath "AppxManifest.xml"
    if (-not (Test-Path $manifestPath)) { return $null }

    [xml]$xml = Get-Content $manifestPath
    
    # Try to find logo
    $logoNodes = @(
        $xml.Package.Applications.Application.VisualElements.Square150x150Logo,
        $xml.Package.Applications.Application.VisualElements.Square44x44Logo,
        $xml.Package.Applications.Application.VisualElements.Logo
    )

    foreach ($logo in $logoNodes) {
        if ($logo) {
            $logoPath = Join-Path $installPath $logo
            
            # Try exact match
            if (Test-Path $logoPath) {
                $result = Get-Base64Icon -Path $logoPath
                if ($result) { return $result }
            }

            # Try variations with higher resolution
            $dir = Split-Path $logoPath
            $name = Split-Path $logoPath -LeafBase
            $ext = Split-Path $logoPath -Extension
            
            # Remove scale/targetsize suffixes
            $name = $name -replace '\.scale-\d+$', '' -replace '\.targetsize-\d+$', '' -replace '\.contrast-\w+$', ''
            
            if (Test-Path $dir) {
                # Priority order for best quality icons
                $patterns = @(
                    "$name.targetsize-256$ext",
                    "$name.targetsize-96$ext",
                    "$name.targetsize-48$ext",
                    "$name.scale-400$ext",
                    "$name.scale-200$ext",
                    "$name.scale-150$ext",
                    "$name.scale-100$ext"
                )
                
                foreach ($pattern in $patterns) {
                    $fullPath = Join-Path $dir $pattern
                    if (Test-Path $fullPath) {
                        $result = Get-Base64Icon -Path $fullPath
                        if ($result) { return $result }
                    }
                }
                
                # Wildcard search as fallback
                $candidates = Get-ChildItem -Path $dir -Filter "$name*$ext" -ErrorAction SilentlyContinue |
                             Where-Object { $_.Name -match '(targetsize-\d+|scale-\d+)' } |
                             Sort-Object Name -Descending |
                             Select-Object -First 1
                
                if ($candidates) {
                    $result = Get-Base64Icon -Path $candidates.FullName
                    if ($result) { return $result }
                }
            }
        }
    }
    
    # Fallback: search Assets folder for any PNG
    $assetsDir = Join-Path $installPath "Assets"
    if (Test-Path $assetsDir) {
        $fallback = Get-ChildItem -Path $assetsDir -Filter "*.png" -Recurse -ErrorAction SilentlyContinue |
                    Where-Object { $_.Name -match '(Square|Logo).*\.(targetsize-256|targetsize-96|scale-400)' } |
                    Sort-Object Name -Descending |
                    Select-Object -First 1
        
        if ($fallback) {
            $result = Get-Base64Icon -Path $fallback.FullName
            if ($result) { return $result }
        }
    }
    
    return $null
}

# Main logic
# 1. Try as file path
if (Test-Path $Target) {
    $res = Get-Base64Icon -Path $Target
    if ($res) { Write-Output $res; exit }
}

# 2. Try as AUMID
if ($Target -match '!') {
    $parts = $Target -split '!'
    $res = Get-UWPIconFromPackage -PackageFamilyName $parts[0]
    if ($res) { Write-Output $res; exit }
}

# 3. Known apps mapping
$knownApps = @{
    "Calculator" = "Microsoft.WindowsCalculator_8wekyb3d8bbwe";
    "Calculadora" = "Microsoft.WindowsCalculator_8wekyb3d8bbwe";
    "Notepad" = "Microsoft.WindowsNotepad_8wekyb3d8bbwe";
    "Notas" = "Microsoft.WindowsNotepad_8wekyb3d8bbwe";
    "Paint" = "Microsoft.Paint_8wekyb3d8bbwe";
    "Photos" = "Microsoft.Windows.Photos_8wekyb3d8bbwe";
    "Fotos" = "Microsoft.Windows.Photos_8wekyb3d8bbwe";
    "Xbox" = "Microsoft.GamingApp_8wekyb3d8bbwe";
    "Terminal" = "Microsoft.WindowsTerminal_8wekyb3d8bbwe";
    "Snipping Tool" = "Microsoft.ScreenSketch_8wekyb3d8bbwe";
    "Ferramenta de Captura" = "Microsoft.ScreenSketch_8wekyb3d8bbwe";
}

if ($knownApps.ContainsKey($Target)) {
    $res = Get-UWPIconFromPackage -PackageFamilyName $knownApps[$Target]
    if ($res) { Write-Output $res; exit }
}

# 4. Search by Name OR AppID in Start Apps
$apps = Get-StartApps | Where-Object { $_.Name -like "*$Target*" -or $_.AppID -eq $Target } | Select-Object -First 1
if ($apps) {
    $appId = $apps.AppID
    if ($appId -match '!') {
        $parts = $appId -split '!'
        $res = Get-UWPIconFromPackage -PackageFamilyName $parts[0]
        if ($res) { Write-Output $res; exit }
    } else {
        # 1. Try if AppID is a direct path
        if (Test-Path $appId) {
            $res = Get-Base64Icon -Path $appId
            if ($res) { Write-Output $res; exit }
        }

        # 2. If not a path (e.g. Squirrel ID or GUID), search for .lnk in Start Menu
        $startMenuPaths = @(
            "$env:APPDATA\Microsoft\Windows\Start Menu\Programs",
            "$env:ProgramData\Microsoft\Windows\Start Menu\Programs"
        )
        
        $appName = $apps.Name
        Write-Host "DEBUG: Searching for .lnk in Start Menu for $appName"
        foreach ($path in $startMenuPaths) {
            if (Test-Path $path) {
                # Search for shortcut matching app name (recursive)
                $lnk = Get-ChildItem -Path $path -Filter "$appName.lnk" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
                
                if ($lnk) {
                    Write-Host "DEBUG: Found shortcut: $($lnk.FullName)"
                    $shell = New-Object -ComObject WScript.Shell
                    $shortcut = $shell.CreateShortcut($lnk.FullName)
                    
                    # Priority 1: IconLocation (often used by Squirrel apps like Discord)
                    if ($shortcut.IconLocation) {
                        $iconPath = $shortcut.IconLocation.Split(',')[0]
                        Write-Host "DEBUG: Shortcut has IconLocation: $iconPath"
                        if (Test-Path $iconPath) {
                             $res = Get-Base64Icon -Path $iconPath
                             if ($res) { Write-Output $res; exit }
                        }
                    }

                    # Priority 2: TargetPath
                    if ($shortcut.TargetPath -and (Test-Path $shortcut.TargetPath)) {
                        Write-Host "DEBUG: Using TargetPath: $($shortcut.TargetPath)"
                        $res = Get-Base64Icon -Path $shortcut.TargetPath
                        if ($res) { Write-Output $res; exit }
                    }
                }
            }
        }
        Write-Host "DEBUG: No icon found via .lnk search"
    }
}
