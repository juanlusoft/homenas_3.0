Get-CimInstance Win32_Process -Filter "Name like 'synobackup-v2-agent-windo%'" | Select-Object ProcessId, Name, CommandLine
