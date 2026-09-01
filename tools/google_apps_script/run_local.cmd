@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0generate_raid_json.ps1" %*

