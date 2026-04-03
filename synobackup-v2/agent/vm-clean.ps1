$ErrorActionPreference = 'Stop'
Get-Process -Name 'synobackup-v2-agent-windows-amd64' -ErrorAction SilentlyContinue | Stop-Process -Force
Remove-Item -Recurse -Force 'C:\ProgramData\SynoBackupV2' -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path 'C:\Tools\SynoBackupV2' -Force | Out-Null
Write-Output 'VM_CLEAN_OK'
