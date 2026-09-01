[CmdletBinding()]
param(
    [switch]$Test
)

$ErrorActionPreference = 'Stop'

$script:TokenUrl = 'https://www.warcraftlogs.com/oauth/token'
$script:ApiUrl = 'https://www.warcraftlogs.com/api/v2/client'
$script:EnvPath = Join-Path $PSScriptRoot '.env'
$script:CsvPath = Join-Path $PSScriptRoot 'raid_ids.csv'

function Read-DotEnv {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Missing .env file: $Path"
    }

    $values = @{}
    foreach ($rawLine in Get-Content -LiteralPath $Path) {
        $line = $rawLine.Trim()
        if (-not $line -or $line.StartsWith('#')) {
            continue
        }

        $parts = $line -split '=', 2
        if ($parts.Count -ne 2) {
            throw "Invalid .env line: $rawLine"
        }

        $name = $parts[0].Trim()
        $value = $parts[1].Trim()
        if (($value.StartsWith('"') -and $value.EndsWith('"')) -or
            ($value.StartsWith("'") -and $value.EndsWith("'"))) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        $values[$name] = $value
    }
    return $values
}

function Get-ReportCode {
    param([string]$Value)

    $text = $Value.Trim()
    if ($text -match '/reports/([A-Za-z0-9]+)') {
        return $Matches[1]
    }
    if ($text -match '^[A-Za-z0-9]+$') {
        return $text
    }
    return $null
}

function Get-WarcraftLogsToken {
    param(
        [Parameter(Mandatory = $true)][string]$ClientId,
        [Parameter(Mandatory = $true)][string]$ClientSecret
    )

    $credentialBytes = [Text.Encoding]::UTF8.GetBytes("${ClientId}:${ClientSecret}")
    $basicAuthorization = [Convert]::ToBase64String($credentialBytes)
    $response = Invoke-RestMethod `
        -Method Post `
        -Uri $script:TokenUrl `
        -Headers @{ Authorization = "Basic $basicAuthorization" } `
        -ContentType 'application/x-www-form-urlencoded' `
        -Body @{ grant_type = 'client_credentials' }

    if (-not $response.access_token) {
        throw 'Warcraft Logs authentication returned no access token.'
    }
    return $response.access_token
}

function Get-WarcraftLogsReport {
    param(
        [Parameter(Mandatory = $true)][string]$ReportCode,
        [Parameter(Mandatory = $true)][string]$AccessToken
    )

    $query = @'
query RaidAttendance($code: String!) {
  reportData {
    report(code: $code, allowUnlisted: true) {
      code
      startTime
      endTime
      masterData(translate: true) {
        actors(type: "Player") {
          id
          name
          server
          subType
        }
      }
      fights {
        id
        name
        encounterID
        kill
        inProgress
        startTime
        endTime
        friendlyPlayers
      }
    }
  }
}
'@

    $requestBody = @{
        query = $query
        variables = @{ code = $ReportCode }
    } | ConvertTo-Json -Depth 10

    $response = Invoke-RestMethod `
        -Method Post `
        -Uri $script:ApiUrl `
        -Headers @{ Authorization = "Bearer $AccessToken" } `
        -ContentType 'application/json' `
        -Body $requestBody

    if ($response.errors) {
        $messages = @($response.errors | ForEach-Object { $_.message }) -join '; '
        throw "Warcraft Logs GraphQL error: $messages"
    }

    $report = $response.data.reportData.report
    if (-not $report) {
        throw "Report $ReportCode was not found or is inaccessible."
    }
    return $report
}

function Convert-EpochMillisecondsToIso {
    param([object]$Value)

    return [DateTimeOffset]::FromUnixTimeMilliseconds([Int64]$Value).UtcDateTime.ToString('o')
}

function ConvertTo-RaidDocument {
    param(
        [Parameter(Mandatory = $true)][object]$Report,
        [datetime]$GeneratedAt = ([datetime]::UtcNow)
    )

    $allFights = @($Report.fights)
    $countedFights = @($allFights | Where-Object {
        [int]$_.encounterID -gt 0 -and $_.inProgress -ne $true
    })
    if ($countedFights.Count -eq 0) {
        $countedFights = @($allFights | Where-Object { $_.inProgress -ne $true })
    }

    $actorById = @{}
    foreach ($actor in @($Report.masterData.actors)) {
        $actorById[[string]$actor.id] = $actor
    }

    $attendeeById = @{}
    foreach ($fight in $countedFights) {
        foreach ($actorId in @($fight.friendlyPlayers)) {
            $key = [string]$actorId
            if (-not $actorById.ContainsKey($key)) {
                continue
            }

            if (-not $attendeeById.ContainsKey($key)) {
                $actor = $actorById[$key]
                $attendeeById[$key] = [ordered]@{
                    name = [string]$actor.name
                    realm = [string]$actor.server
                    class = [string]$actor.subType
                    bossPullsAttended = 0
                    killsAttended = 0
                    fights = [Collections.Generic.List[object]]::new()
                }
            }

            $attendee = $attendeeById[$key]
            $attendee.bossPullsAttended++
            if ($fight.kill -eq $true) {
                $attendee.killsAttended++
            }
            $attendee.fights.Add([ordered]@{
                id = $fight.id
                encounterId = $fight.encounterID
                name = [string]$fight.name
                kill = ($fight.kill -eq $true)
            })
        }
    }

    $pullCount = $countedFights.Count
    $attendees = @($attendeeById.Values | ForEach-Object {
        $attendancePercent = if ($pullCount) {
            [Math]::Round(($_.bossPullsAttended * 100.0 / $pullCount), 2)
        } else {
            0
        }
        [ordered]@{
            name = $_.name
            realm = $_.realm
            class = $_.class
            bossPullsAttended = $_.bossPullsAttended
            killsAttended = $_.killsAttended
            fights = @($_.fights)
            attendancePercent = $attendancePercent
        }
    } | Sort-Object { $_.name })

    return [ordered]@{
        raidId = [string]$Report.code
        generatedAt = $GeneratedAt.ToUniversalTime().ToString('o')
        report = [ordered]@{
            startTime = Convert-EpochMillisecondsToIso $Report.startTime
            endTime = Convert-EpochMillisecondsToIso $Report.endTime
        }
        summary = [ordered]@{
            attendees = $attendees.Count
            bossPulls = $pullCount
            kills = @($countedFights | Where-Object { $_.kill -eq $true }).Count
        }
        attendees = $attendees
    }
}

function Write-Utf8WithoutBom {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Contents
    )

    $utf8WithoutBom = New-Object Text.UTF8Encoding($false)
    [IO.File]::WriteAllText($Path, $Contents, $utf8WithoutBom)
}

function Get-QualifiedAttendeeNames {
    param(
        [Parameter(Mandatory = $true)][object]$RaidDocument,
        [double]$MinimumAttendancePercent = 25
    )

    return @($RaidDocument.attendees |
        Where-Object { [double]$_.attendancePercent -gt $MinimumAttendancePercent } |
        ForEach-Object { [string]$_.name })
}

function Assert-Equal {
    param($Actual, $Expected, [string]$Label)
    if ($Actual -ne $Expected) {
        throw "$Label`: expected '$Expected', got '$Actual'."
    }
}

function Test-RaidTransformer {
    $fixture = [pscustomobject]@{
        code = 'TEST123'
        startTime = 1785607200000
        endTime = 1785618000000
        masterData = [pscustomobject]@{ actors = @(
            [pscustomobject]@{ id = 1; name = 'Alice'; server = 'RealmOne'; subType = 'Priest' },
            [pscustomobject]@{ id = 2; name = 'Bob'; server = 'RealmTwo'; subType = 'Warrior' },
            [pscustomobject]@{ id = 3; name = 'TrashOnly'; server = 'RealmOne'; subType = 'Rogue' }
        ) }
        fights = @(
            [pscustomobject]@{ id = 10; name = 'Trash'; encounterID = 0; kill = $false; friendlyPlayers = @(1, 3) },
            [pscustomobject]@{ id = 11; name = 'Boss One'; encounterID = 101; kill = $true; friendlyPlayers = @(1, 2) },
            [pscustomobject]@{ id = 12; name = 'Boss Two'; encounterID = 102; kill = $false; friendlyPlayers = @(1) }
        )
    }

    $document = ConvertTo-RaidDocument -Report $fixture
    Assert-Equal $document.raidId 'TEST123' 'raid ID'
    Assert-Equal $document.summary.attendees 2 'attendee count'
    Assert-Equal $document.summary.bossPulls 2 'boss pull count'
    Assert-Equal $document.summary.kills 1 'kill count'
    Assert-Equal $document.attendees[0].name 'Alice' 'attendee sorting'
    Assert-Equal $document.attendees[0].attendancePercent 100 'Alice attendance'
    Assert-Equal $document.attendees[1].attendancePercent 50 'Bob attendance'
    Assert-Equal (Get-ReportCode 'https://www.warcraftlogs.com/reports/JLtYATQjzR9wc3mH') 'JLtYATQjzR9wc3mH' 'URL parsing'
    $thresholdFixture = [pscustomobject]@{ attendees = @(
        [pscustomobject]@{ name = 'Excluded'; attendancePercent = 25 },
        [pscustomobject]@{ name = 'Included'; attendancePercent = 25.01 }
    ) }
    $qualifiedNames = @(Get-QualifiedAttendeeNames -RaidDocument $thresholdFixture)
    Assert-Equal $qualifiedNames.Count 1 'strict attendance threshold count'
    Assert-Equal $qualifiedNames[0] 'Included' 'strict attendance threshold name'
    Write-Host 'PASS: local raid JSON transformer tests passed.' -ForegroundColor Green
}

if ($Test) {
    Test-RaidTransformer
    exit 0
}

$settings = Read-DotEnv -Path $script:EnvPath
$clientId = [string]$settings.WCL_CLIENT_ID
$clientSecret = [string]$settings.WCL_CLIENT_SECRET
if (-not $clientId -or -not $clientSecret) {
    throw 'Fill WCL_CLIENT_ID and WCL_CLIENT_SECRET in tools/google_apps_script/.env.'
}

if (-not (Test-Path -LiteralPath $script:CsvPath)) {
    throw "Missing CSV file: $script:CsvPath"
}
$raidRows = @(Import-Csv -LiteralPath $script:CsvPath)
if (-not $raidRows.Count -or -not ($raidRows[0].PSObject.Properties.Name -contains 'raid_id')) {
    throw 'raid_ids.csv must contain a raid_id header and at least one data row.'
}

$configuredOutput = [string]$settings.OUTPUT_DIR
if (-not $configuredOutput) {
    $configuredOutput = 'output'
}
$outputDirectory = if ([IO.Path]::IsPathRooted($configuredOutput)) {
    $configuredOutput
} else {
    Join-Path $PSScriptRoot $configuredOutput
}
[void](New-Item -ItemType Directory -Path $outputDirectory -Force)

Write-Host 'Authenticating with Warcraft Logs...'
$accessToken = Get-WarcraftLogsToken -ClientId $clientId -ClientSecret $clientSecret

$failedReports = 0
foreach ($row in $raidRows) {
    $reportCode = Get-ReportCode ([string]$row.raid_id)
    if (-not $reportCode) {
        Write-Warning "Skipping invalid report ID: $($row.raid_id)"
        continue
    }

    Write-Host "Fetching $reportCode..."
    try {
        $report = Get-WarcraftLogsReport -ReportCode $reportCode -AccessToken $accessToken
        $document = ConvertTo-RaidDocument -Report $report
        $json = $document | ConvertTo-Json -Depth 20
        $outputPath = Join-Path $outputDirectory "$reportCode.json"
        Write-Utf8WithoutBom -Path $outputPath -Contents $json

        $qualifiedNames = @(Get-QualifiedAttendeeNames -RaidDocument $document)
        $namesJson = ConvertTo-Json -InputObject $qualifiedNames
        $namesOutputPath = Join-Path $outputDirectory "${reportCode}_attendees.json"
        Write-Utf8WithoutBom -Path $namesOutputPath -Contents $namesJson

        Write-Host "Created $outputPath ($($document.summary.attendees) attendees)." -ForegroundColor Green
        Write-Host "Created $namesOutputPath ($($qualifiedNames.Count) names above 25%)." -ForegroundColor Green
    } catch {
        $failedReports++
        Write-Warning "Failed to generate JSON for $reportCode`: $($_.Exception.Message)"
    }
}

if ($failedReports -gt 0) {
    throw "$failedReports report(s) failed. See the warnings above."
}
