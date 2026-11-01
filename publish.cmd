@echo off
rem One-command publish of the jyfk.lol games portal: publish.cmd   or   publish.cmd --dry-run
rem The full log is also written to _publish\report.md
cd /d "%~dp0"
python scripts\publish.py %*
