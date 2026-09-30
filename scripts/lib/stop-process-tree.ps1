param(
    [Parameter(Mandatory = $true)][int]$RootProcessId,
    [Parameter(Mandatory = $true)][long]$EarliestMilliseconds,
    [Parameter(Mandatory = $true)][long]$LatestMilliseconds,
    [long]$ExitedAtMilliseconds = 0
)

$ErrorActionPreference = 'Stop'

# A process that exits between the CIM snapshot and this probe has no identity left to compare,
# and Windows PowerShell surfaces its StartTime as $null. Reading it unguarded aborts the whole
# cleanup and leaves the rest of the tree running.
function Get-ConfirmedStartTime {
    param([int]$ProcessId)
    $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    if ($null -eq $process) { return $null }
    try { $start = $process.StartTime } catch { return $null }
    if ($null -eq $start) { return $null }
    return $start.ToUniversalTime()
}

function Test-ProcessAlive {
    param([int]$ProcessId)
    $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    if ($null -eq $process) { return $false }
    try { return -not $process.HasExited } catch { return $true }
}

# Node's Date.now() and the kernel's process creation time tick independently, each as coarsely as the
# system timer (15.6 ms by default), so a creation time can land a few ticks outside the interval Node
# recorded around spawn. The bound absorbs that; it is not a scheduling allowance.
$clockToleranceMilliseconds = 50
$earliest = [DateTimeOffset]::FromUnixTimeMilliseconds($EarliestMilliseconds - $clockToleranceMilliseconds).UtcDateTime
$latest = [DateTimeOffset]::FromUnixTimeMilliseconds($LatestMilliseconds + $clockToleranceMilliseconds).UtcDateTime
$rows = @(Get-CimInstance Win32_Process | Where-Object { $null -ne $_.CreationDate -and $_.CreationDate.ToUniversalTime() -ge $earliest })
$root = @($rows | Where-Object { $_.ProcessId -eq $RootProcessId })
# Windows keeps a PID reserved for as long as any handle to the process is open, and Node holds one
# until it has reported the exit. A root that has not exited yet (ExitedAtMilliseconds = 0) therefore
# still owns its PID whatever its creation time says. Only after the exit can a later process have
# taken the PID over, and then it must have been created inside the recorded spawn interval to be ours.
if ($ExitedAtMilliseconds -ne 0 -and $root.Count -gt 0 -and $root[0].CreationDate.ToUniversalTime() -gt $latest) {
    $overshoot = [int]($root[0].CreationDate.ToUniversalTime() - $latest).TotalMilliseconds
    throw "Root PID $RootProcessId was reused ($overshoot ms after the spawn interval); refusing to terminate it."
}
if ($root.Count -eq 0 -and $ExitedAtMilliseconds -eq 0) {
    throw "Root identity no longer observable; refusing an unqualified process-tree sweep."
}
$exitedAt = [DateTimeOffset]::FromUnixTimeMilliseconds($ExitedAtMilliseconds).UtcDateTime
$owned = New-Object 'System.Collections.Generic.HashSet[int]'
[void]$owned.Add($RootProcessId)
do {
    $changed = $false
    foreach ($row in $rows) {
        # An exited root could not have created a child after the observed exit.
        if ($root.Count -eq 0 -and $row.ParentProcessId -eq $RootProcessId -and $row.CreationDate.ToUniversalTime() -gt $exitedAt) { continue }
        if ($owned.Contains([int]$row.ParentProcessId) -and $owned.Add([int]$row.ProcessId)) { $changed = $true }
    }
} while ($changed)
$targets = @($rows | Where-Object { $owned.Contains([int]$_.ProcessId) })
$taskkill = Join-Path $env:SystemRoot 'System32\taskkill.exe'
foreach ($row in $targets) {
    $start = Get-ConfirmedStartTime $row.ProcessId
    if ($null -ne $start -and [Math]::Abs(($start - $row.CreationDate.ToUniversalTime()).TotalMilliseconds) -lt 10) {
        $previousPreference = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        & $taskkill /PID $row.ProcessId /T /F 2>&1 | Out-Null
        $ErrorActionPreference = $previousPreference
    }
}
$remaining = @($targets | Where-Object { Test-ProcessAlive $_.ProcessId })
if ($remaining.Count -gt 0) { throw "Owned processes survived: $($remaining.ProcessId -join ',')" }
exit 0
