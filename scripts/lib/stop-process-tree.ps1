param(
    [Parameter(Mandatory = $true)][int]$RootProcessId,
    [Parameter(Mandatory = $true)][long]$EarliestMilliseconds,
    [Parameter(Mandatory = $true)][long]$LatestMilliseconds,
    [long]$ExitedAtMilliseconds = 0
)

$ErrorActionPreference = 'Stop'
$cleanupPhaseClock = [Diagnostics.Stopwatch]::StartNew()
$cleanupDetailCount = 0
$cleanupDetailsTruncated = $false
function Write-CleanupPhase {
    param([string]$PhaseName, [string]$Detail = '', [switch]$TargetDetail)
    # Reserve lifecycle records so large trees cannot hide the final cleanup state.
    if ($TargetDetail) {
        if ($script:cleanupDetailCount -ge 20) {
            if (-not $script:cleanupDetailsTruncated) {
                $script:cleanupDetailsTruncated = $true
                Write-CleanupPhase 'details-truncated' 'limit=20'
            }
            return
        }
        $script:cleanupDetailCount++
    }
    try {
        [Console]::Error.WriteLine("cleanup-phase t+$($script:cleanupPhaseClock.ElapsedMilliseconds)ms $PhaseName $Detail")
    } catch {
        # A closed diagnostic pipe must not prevent the owned cleanup.
    }
}
Write-CleanupPhase 'entry' "helper=$PID root=$RootProcessId ps=$($PSVersionTable.PSVersion)"

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
Write-CleanupPhase 'cim-begin'
$rows = @(Get-CimInstance Win32_Process | Where-Object { $null -ne $_.CreationDate -and $_.CreationDate.ToUniversalTime() -ge $earliest })
Write-CleanupPhase 'cim-end' "rows=$($rows.Count)"
Write-CleanupPhase 'root-identity-begin'
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
Write-CleanupPhase 'root-identity-end' "matches=$($root.Count)"
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
Write-CleanupPhase 'targets' "count=$($targets.Count)"
$taskkill = Join-Path $env:SystemRoot 'System32\taskkill.exe'
foreach ($row in $targets) {
    Write-CleanupPhase 'identity-begin' "target=$($row.ProcessId)" -TargetDetail
    $start = Get-ConfirmedStartTime $row.ProcessId
    Write-CleanupPhase 'identity-end' "target=$($row.ProcessId) observable=$($null -ne $start)" -TargetDetail
    if ($null -ne $start -and [Math]::Abs(($start - $row.CreationDate.ToUniversalTime()).TotalMilliseconds) -lt 10) {
        $previousPreference = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        Write-CleanupPhase 'taskkill-begin' "target=$($row.ProcessId)" -TargetDetail
        & $taskkill /PID $row.ProcessId /T /F 2>&1 | Out-Null
        Write-CleanupPhase 'taskkill-end' "target=$($row.ProcessId) exit=$LASTEXITCODE" -TargetDetail
        $ErrorActionPreference = $previousPreference
    }
}
Write-CleanupPhase 'remaining-begin'
$remaining = @($targets | Where-Object { Test-ProcessAlive $_.ProcessId })
Write-CleanupPhase 'remaining-end' "count=$($remaining.Count)"
if ($remaining.Count -gt 0) { throw "Owned processes survived: $($remaining.ProcessId -join ',')" }
Write-CleanupPhase 'exit'
exit 0
