$ProgressPreference = 'SilentlyContinue'
$dstDir = 'C:\Users\codex.w11-test\Downloads'
$dst = Join-Path $dstDir 'urbackup-client.msi'
New-Item -ItemType Directory -Force -Path $dstDir | Out-Null
$u = 'https://hndl.urbackup.org/Client/latest/UrBackup%20Client%20(No%20tray)%202.5.29(x64).msi'
Invoke-WebRequest -Uri $u -OutFile $dst
Start-Process msiexec.exe -ArgumentList '/i', $dst, '/qn', 'SERVER=192.168.1.81' -Wait
Get-Service | Where-Object { $_.Name -like '*UrBackup*' -or $_.DisplayName -like '*UrBackup*' } | Select-Object Name,Status,DisplayName
