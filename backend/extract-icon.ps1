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

function ConvertTo-NormalizedIconBitmap {
    param ([System.Drawing.Bitmap]$Source)
    
    $canvasSize  = 256
    $targetRatio = 0.75  # If the icon already fills 75%+ of its canvas, it's correctly sized — don't upscale
    $padding     = [int]($canvasSize * 0.10)  # 10% padding (for small icons that need upscaling)
    $innerSize   = $canvasSize - ($padding * 2)
    
    # Find the tight bounding box of visible pixels
    $minX = $Source.Width;  $minY = $Source.Height
    $maxX = 0;              $maxY = 0
    $found = $false
    
    for ($y = 0; $y -lt $Source.Height; $y++) {
        for ($x = 0; $x -lt $Source.Width; $x++) {
            $px = $Source.GetPixel($x, $y)
            if ($px.A -gt 15) {
                if ($x -lt $minX) { $minX = $x }
                if ($y -lt $minY) { $minY = $y }
                if ($x -gt $maxX) { $maxX = $x }
                if ($y -gt $maxY) { $maxY = $y }
                $found = $true
            }
        }
    }
    
    if (-not $found) {
        $minX = 0; $minY = 0; $maxX = $Source.Width - 1; $maxY = $Source.Height - 1
    }
    
    $contentW = $maxX - $minX + 1
    $contentH = $maxY - $minY + 1
    $maxDim   = [Math]::Max($Source.Width, $Source.Height)
    $contentRatio = [Math]::Max($contentW, $contentH) / $maxDim
    
    # Create a clean 256x256 transparent canvas
    $canvas = New-Object System.Drawing.Bitmap($canvasSize, $canvasSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($canvas)
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode    = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    
    if ($contentRatio -ge $targetRatio) {
        # Icon is already well-sized (like Edge) — render at natural proportions, just resize to 256x256
        # This preserves the icon's original visual weight without enlarging it
        $scale = $canvasSize / $maxDim
        $drawW = [int]($Source.Width * $scale)
        $drawH = [int]($Source.Height * $scale)
        $destX = [int](($canvasSize - $drawW) / 2)
        $destY = [int](($canvasSize - $drawH) / 2)
        $g.DrawImage($Source, $destX, $destY, $drawW, $drawH)
    } else {
        # Icon content is too small — upscale content to fill the inner target area (80% of canvas)
        $scale = [Math]::Min($innerSize / $contentW, $innerSize / $contentH)
        $drawW = [int]($contentW * $scale)
        $drawH = [int]($contentH * $scale)
        $destX = $padding + [int](($innerSize - $drawW) / 2)
        $destY = $padding + [int](($innerSize - $drawH) / 2)
        $srcRect = New-Object System.Drawing.Rectangle($minX, $minY, $contentW, $contentH)
        $dstRect = New-Object System.Drawing.Rectangle($destX, $destY, $drawW, $drawH)
        $g.DrawImage($Source, $dstRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
    }
    
    $g.Dispose()
    return $canvas
}

function Get-Base64Icon {
    param ([string]$Path)
    if (-not (Test-Path $Path)) { return $null }
    
    try {
        $bitmap = $null
        
        # Check if it's a PNG file - load directly
        if ($Path -match '\.(png|jpg|jpeg|bmp)$') {
            $bitmap = [System.Drawing.Bitmap]::FromFile($Path)
        } else {
            # Try High-Res Extraction first (for .exe, .ico, .lnk)
            $icon = [IconExtractor]::GetJumboIcon($Path)
            
            # Fallback if Jumbo fails
            if (-not $icon) {
                $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($Path)
            }
            
            if ($icon) {
                $bitmap = $icon.ToBitmap()
                $icon.Dispose()
            }
        }
        
        if ($bitmap) {
            # Normalize all icons to uniform size and padding
            $normalized = ConvertTo-NormalizedIconBitmap -Source $bitmap
            $bitmap.Dispose()
            
            $stream = New-Object System.IO.MemoryStream
            $normalized.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
            $bytes = $stream.ToArray()
            $base64 = [Convert]::ToBase64String($bytes)
            $stream.Close(); $stream.Dispose(); $normalized.Dispose()
            return "data:image/png;base64,$base64"
        }
    } catch {}
    return $null
}

function Get-UWPIconFromPackage {
    param ([string]$PackageFamilyName)
    
    # Speed optimization: filter by name directly
    $pkg = Get-AppxPackage -Name ($PackageFamilyName.Split('_')[0]) | Where-Object { $_.PackageFamilyName -eq $PackageFamilyName }
    if (-not $pkg) { 
        # Fallback: try search without filter if split failed
        $pkg = Get-AppxPackage | Where-Object { $_.PackageFamilyName -eq $PackageFamilyName }
        if (-not $pkg) { return $null }
    }

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
    if ((Get-Item $Target).Attributes -match "Directory") {
        # If it's a directory, we can't extract associated icon normally, but let's try shell info
    } else {
        $res = Get-Base64Icon -Path $Target
        if ($res) { Write-Output $res; exit }
    }
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
$apps = Get-StartApps | Where-Object { $_.Name -like "*$Target*" -or $_.AppID -eq $Target -or $_.AppID -like "*$Target*" } | Select-Object -First 1
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
        foreach ($path in $startMenuPaths) {
            if (Test-Path $path) {
                # Search for shortcut matching app name (recursive)
                $lnk = Get-ChildItem -Path $path -Filter "$appName.lnk" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
                
                if ($lnk) {
                    $shell = New-Object -ComObject WScript.Shell
                    $shortcut = $shell.CreateShortcut($lnk.FullName)
                    
                    # Priority 1: IconLocation (often used by Squirrel apps like Discord)
                    if ($shortcut.IconLocation) {
                        $iconPath = $shortcut.IconLocation.Split(',')[0]
                        if ($iconPath -and (Test-Path $iconPath)) {
                             $res = Get-Base64Icon -Path $iconPath
                             if ($res) { Write-Output $res; exit }
                        }
                    }

                    # Priority 2: TargetPath
                    if ($shortcut.TargetPath -and (Test-Path $shortcut.TargetPath)) {
                        $res = Get-Base64Icon -Path $shortcut.TargetPath
                        if ($res) { Write-Output $res; exit }
                    }
                }
            }
        }
    }
}

