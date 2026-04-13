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
    $targetRatio = 0.75
    $padding     = [int]($canvasSize * 0.10)
    $innerSize   = $canvasSize - ($padding * 2)
    
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
    
    $canvas = New-Object System.Drawing.Bitmap($canvasSize, $canvasSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($canvas)
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode    = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    
    if ($contentRatio -ge $targetRatio) {
        $scale = $canvasSize / $maxDim
        $drawW = [int]($Source.Width * $scale)
        $drawH = [int]($Source.Height * $scale)
        $destX = [int](($canvasSize - $drawW) / 2)
        $destY = [int](($canvasSize - $drawH) / 2)
        $g.DrawImage($Source, $destX, $destY, $drawW, $drawH)
    } else {
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
    if (-not (Test-Path $Path)) { 
        Write-Error "Path not found: $($Path)"
        return $null 
    }
    
    try {
        $bitmap = $null
        
        if ($Path -match '\.(png|jpg|jpeg|bmp)$') {
            $bitmap = [System.Drawing.Bitmap]::FromFile($Path)
        } else {
            $icon = [IconExtractor]::GetJumboIcon($Path)
            if (-not $icon) {
                Write-Error "Jumbo icon extraction failed for $($Path), trying ExtractAssociatedIcon"
                $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($Path)
            }
            if ($icon) {
                $bitmap = $icon.ToBitmap()
                $icon.Dispose()
            }
        }
        
        if ($bitmap) {
            $normalized = ConvertTo-NormalizedIconBitmap -Source $bitmap
            $bitmap.Dispose()
            $stream = New-Object System.IO.MemoryStream
            $normalized.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
            $bytes = $stream.ToArray()
            $base64 = [Convert]::ToBase64String($bytes)
            $stream.Close(); $stream.Dispose(); $normalized.Dispose()
            return "data:image/png;base64,$base64"
        } else {
            Write-Error "Failed to create bitmap from $($Path)"
        }
    } catch {
        Write-Error "Exception in Get-Base64Icon for $($Path): $_"
    }
    return $null
}

function Get-UWPIconFromPackage {
    param ([string]$PackageFamilyName)
    if (-not $PackageFamilyName) {
        Write-Error "UWP: empty PackageFamilyName"
        return $null
    }

    # 1) Exact PFN (Package Family Name) — most reliable
    $pkg = Get-AppxPackage -ErrorAction SilentlyContinue | Where-Object { $_.PackageFamilyName -eq $PackageFamilyName }

    # 2) Short package name (segment before _publisherId)
    if (-not $pkg) {
        $shortName = ($PackageFamilyName -split '_')[0]
        if ($shortName) {
            $pkg = Get-AppxPackage -Name $shortName -ErrorAction SilentlyContinue | Where-Object { $_.PackageFamilyName -eq $PackageFamilyName } | Select-Object -First 1
        }
    }

    # 3) Prefix match (Copilot / CBS / renamed bundles)
    if (-not $pkg) {
        $prefix = ($PackageFamilyName -split '_')[0]
        if ($prefix) {
            $likePat = $prefix + '_*'
            $pkg = Get-AppxPackage -ErrorAction SilentlyContinue |
                Where-Object { $_.PackageFamilyName -eq $PackageFamilyName -or $_.PackageFamilyName -like $likePat } |
                Select-Object -First 1
        }
    }

    $installPath = $null
    if ($pkg) { $installPath = $pkg.InstallLocation }

    # 4) Sparse / locked-down packages: locate folder under Program Files\WindowsApps
    if (-not $installPath) {
        $waRoot = Join-Path ${env:ProgramFiles} "WindowsApps"
        if (Test-Path $waRoot) {
            $exact = Join-Path $waRoot $PackageFamilyName
            if (Test-Path $exact) {
                $installPath = $exact
            } else {
                $pre = ($PackageFamilyName -split '_')[0]
                $dirLike = $pre + '_*'
                $dir = Get-ChildItem -Path $waRoot -Directory -ErrorAction SilentlyContinue |
                    Where-Object { $_.Name -eq $PackageFamilyName -or ($pre -and $_.Name -like $dirLike) } |
                    Sort-Object Name |
                    Select-Object -First 1
                if ($dir) { $installPath = $dir.FullName }
            }
        }
    }

    if (-not $installPath) {
        Write-Error "UWP Package not found: $PackageFamilyName"
        return $null
    }
    $manifestPath = Join-Path $installPath "AppxManifest.xml"
    if (-not (Test-Path $manifestPath)) { 
        Write-Error "UWP Manifest not found at $manifestPath"
        return $null 
    }
    [xml]$xml = Get-Content $manifestPath
    $logoNodes = @()
    foreach ($appEntry in @($xml.Package.Applications.Application)) {
        if (-not $appEntry.VisualElements) { continue }
        $ve = $appEntry.VisualElements
        $logoNodes += @($ve.Square150x150Logo, $ve.Square310x310Logo, $ve.Square44x44Logo, $ve.Logo, $ve.Wide310x150Logo)
    }
    $logoNodes = $logoNodes | Where-Object { $_ }
    foreach ($logo in $logoNodes) {
        if ($logo) {
            $logoPath = Join-Path $installPath $logo
            if (Test-Path $logoPath) {
                Write-Error "Trying exact logo match: $($logoPath)"
                $result = Get-Base64Icon -Path $logoPath
                if ($result) { return $result }
            }
            $dir = Split-Path $logoPath
            $name = Split-Path $logoPath -LeafBase
            $ext = Split-Path $logoPath -Extension
            $name = $name -replace '\.scale-\d+$', '' -replace '\.targetsize-\d+$', '' -replace '\.contrast-\w+$', ''
            if (Test-Path $dir) {
                $patterns = @("$name.targetsize-256$ext", "$name.targetsize-96$ext", "$name.targetsize-48$ext", "$name.scale-400$ext", "$name.scale-200$ext", "$name.scale-150$ext", "$name.scale-100$ext")
                foreach ($pattern in $patterns) {
                    $fullPath = Join-Path $dir $pattern
                    if (Test-Path $fullPath) {
                        Write-Error "Trying logo variation: $($fullPath)"
                        $result = Get-Base64Icon -Path $fullPath
                        if ($result) { return $result }
                    }
                }
                $candidates = Get-ChildItem -Path $dir -Filter "$name*$ext" -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '(targetsize-\d+|scale-\d+)' } | Sort-Object Name -Descending | Select-Object -First 1
                if ($candidates) {
                    Write-Error "Trying wildcard candidate: $($candidates.FullName)"
                    $result = Get-Base64Icon -Path $candidates.FullName
                    if ($result) { return $result }
                }
            } else {
                Write-Error "Logo directory not found: $($dir)"
            }
        }
    }
    $assetsDir = Join-Path $installPath "Assets"
    if (Test-Path $assetsDir) {
        Write-Error "Trying fallback search in Assets folder: $assetsDir"
        $fallback = Get-ChildItem -Path $assetsDir -Filter "*.png" -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '(Square|Logo).*\.(targetsize-256|targetsize-96|scale-400)' } | Sort-Object Name -Descending | Select-Object -First 1
        if ($fallback) {
            $result = Get-Base64Icon -Path $fallback.FullName
            if ($result) { return $result }
        }
    }
    Write-Error "UWP icon extraction failed for $PackageFamilyName"
    return $null
}

# Main logic
if ($Target -and (Test-Path $Target)) {
    if ((Get-Item $Target).Attributes -match "Directory") {
        $res = Get-Base64Icon -Path $Target
        if ($res) { Write-Output $res; exit }
    } else {
        $res = Get-Base64Icon -Path $Target
        if ($res) { Write-Output $res; exit }
    }
}
if ($Target -match '!') {
    $parts = $Target -split '!'
    $res = Get-UWPIconFromPackage -PackageFamilyName $parts[0]
    if ($res) { Write-Output $res; exit }
}
if ($Target -ieq "MSEdge" -or $Target -imatch "MicrosoftEdge" -or $Target -ieq "msedge") {
    $edgePath = Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe"
    if (Test-Path $edgePath) { $res = Get-Base64Icon -Path $edgePath; if ($res) { Write-Output $res; exit } }
}
if ($Target -ieq "Explorer" -or $Target -ieq "File Explorer") {
    $expPath = Join-Path $env:SystemRoot "explorer.exe"
    if (Test-Path $expPath) { $res = Get-Base64Icon -Path $expPath; if ($res) { Write-Output $res; exit } }
}
$startApp = Get-StartApps | Where-Object { $_.Name -eq $Target -or $_.AppID -eq $Target -or $_.AppID -like "*$Target*" } | Select-Object -First 1
if (-not $startApp) { $startApp = Get-StartApps | Where-Object { $_.Name -match $Target } | Select-Object -First 1 }
if ($startApp) {
    $appId = $startApp.AppID
    if ($appId -match '!') {
        $res = Get-UWPIconFromPackage -PackageFamilyName ($appId -split '!')[0]
        if ($res) { Write-Output $res; exit }
    }
    if (Test-Path $appId) {
        $res = Get-Base64Icon -Path $appId
        if ($res) { Write-Output $res; exit }
    }
    $smPaths = @("$env:APPDATA\Microsoft\Windows\Start Menu\Programs", "$env:ProgramData\Microsoft\Windows\Start Menu\Programs")
    $appName = $startApp.Name
    foreach ($p in $smPaths) {
        if (Test-Path $p) {
            $lnk = Get-ChildItem -Path $p -Filter "$appName.lnk" -Recurse | Select-Object -First 1
            if ($lnk) {
                try {
                    $sh = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk.FullName)
                    if ($sh.IconLocation -and $sh.IconLocation -ne ",0") {
                        $iconPath = $sh.IconLocation.Split(',')[0]
                        if (Test-Path $iconPath) { $res = Get-Base64Icon -Path $iconPath; if ($res) { Write-Output $res; exit } }
                    }
                    if ($sh.TargetPath -and (Test-Path $sh.TargetPath)) {
                        $res = Get-Base64Icon -Path $sh.TargetPath
                        if ($res) { Write-Output $res; exit }
                    }
                    $res = Get-Base64Icon -Path $lnk.FullName
                    if ($res) { Write-Output $res; exit }
                } catch {}
            }
        }
    }
}
$knownApps = @{"Calculator" = "Microsoft.WindowsCalculator_8wekyb3d8bbwe"; "Calculadora" = "Microsoft.WindowsCalculator_8wekyb3d8bbwe"; "Notepad" = "Microsoft.WindowsNotepad_8wekyb3d8bbwe"; "Edge" = "Microsoft.MicrosoftEdge_8wekyb3d8bbwe"}
if ($knownApps.ContainsKey($Target)) {
    $res = Get-UWPIconFromPackage -PackageFamilyName $knownApps[$Target]
    if ($res) { Write-Output $res; exit }
}
