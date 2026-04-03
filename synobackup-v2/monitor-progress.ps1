param(
  [int]$IntervalSec = 20,
  [int]$Iterations = 0
)

$initialEstimateBytes = [double]31583076352
$prevBytes = $null
$prevAt = $null
$iter = 0

while ($true) {
  $raw = ssh juanlu@192.168.1.81 "cat /home/juanlu/synobackup-v2/core/data/state.json"
  $state = $raw | ConvertFrom-Json

  if (-not $state.sessions -or $state.sessions.Count -eq 0) {
    Write-Output "[..................................................]  0.00%  waiting session..."
  } else {
    $session = $state.sessions[0][1]
    $status = [string]$session.status
    $bytes = [double]$session.totalBytes
    $files = [int]$session.fileCount

    $rawPct = ($bytes / $initialEstimateBytes) * 100.0
    if ($status -eq 'completed') {
      $pct = 100.0
      $progressNote = 'real: completed'
    } elseif ($rawPct -ge 100.0) {
      $pct = 99.9
      $progressNote = 'estimado: >100% base'
    } else {
      $pct = [Math]::Max(0.0, [Math]::Min(99.9, $rawPct))
      $progressNote = 'estimado'
    }

    $filled = [int][Math]::Floor($pct / 2)
    $bar = ('#' * $filled).PadRight(50,'.')
    $now = Get-Date
    $eta = 'ETA --'

    if ($status -eq 'completed') {
      $eta = 'ETA 00:00:00'
    } elseif ($prevBytes -ne $null -and $bytes -gt $prevBytes) {
      $dt = ($now - $prevAt).TotalSeconds
      if ($dt -gt 0) {
        $rate = ($bytes - $prevBytes) / $dt
        if ($rate -gt 0) {
          $remaining = [Math]::Max([double]0, $initialEstimateBytes - $bytes)
          $etaSec = [int64]($remaining / $rate)
          $eta = ('ETA ' + ([TimeSpan]::FromSeconds($etaSec).ToString('hh\:mm\:ss')))
        }
      }
    }

    $gb = [Math]::Round($bytes/1GB,2)
    $estGb = [Math]::Round($initialEstimateBytes/1GB,2)
    Write-Output ("[{0}] {1,6:N2}%  {2}/{3} GB  files={4}  status={5}  {6}  {7}" -f $bar,$pct,$gb,$estGb,$files,$status,$eta,$progressNote)

    $prevBytes = $bytes
    $prevAt = $now
  }

  if ($Iterations -gt 0) {
    $iter++
    if ($iter -ge $Iterations) { break }
  }
  Start-Sleep -Seconds $IntervalSec
}
