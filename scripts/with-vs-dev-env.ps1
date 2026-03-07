$ErrorActionPreference = "Stop"

function Get-VsDevCmdPath {
  $candidates = @(
    "C:\Program Files\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat",
    "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat",
    "C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\Tools\VsDevCmd.bat",
    "C:\Program Files (x86)\Microsoft Visual Studio\2022\Community\Common7\Tools\VsDevCmd.bat",
    "C:\Program Files\Microsoft Visual Studio\2022\Professional\Common7\Tools\VsDevCmd.bat",
    "C:\Program Files (x86)\Microsoft Visual Studio\2022\Professional\Common7\Tools\VsDevCmd.bat",
    "C:\Program Files\Microsoft Visual Studio\2022\Enterprise\Common7\Tools\VsDevCmd.bat",
    "C:\Program Files (x86)\Microsoft Visual Studio\2022\Enterprise\Common7\Tools\VsDevCmd.bat"
  )

  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) {
      return $candidate
    }
  }

  return $null
}

function Import-VsBuildEnvironment {
  $vsDevCmd = Get-VsDevCmdPath
  if (-not $vsDevCmd) {
    return $false
  }

  $setOutput = & cmd.exe /d /s /c "`"$vsDevCmd`" -arch=x64 -host_arch=x64 >nul && set"
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to initialize Visual Studio build tools environment."
  }

  foreach ($line in $setOutput) {
    $parts = $line -split "=", 2
    if ($parts.Length -ne 2) {
      continue
    }
    [System.Environment]::SetEnvironmentVariable($parts[0], $parts[1], "Process")
  }

  return $true
}

if (-not (Get-Command link.exe -ErrorAction SilentlyContinue)) {
  $initialized = Import-VsBuildEnvironment
  if (-not $initialized) {
    Write-Error "Visual Studio Build Tools environment was not found. Install Visual Studio Build Tools 2022 with Desktop development with C++."
    exit 1
  }
}

if ($args.Count -eq 0) {
  Write-Error "No command was provided."
  exit 1
}

$command = $args[0]
$commandArgs = @()
if ($args.Count -gt 1) {
  $commandArgs = $args[1..($args.Count - 1)]
}

& $command @commandArgs
exit $LASTEXITCODE
