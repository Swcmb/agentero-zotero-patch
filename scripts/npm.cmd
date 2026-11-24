@echo off
setlocal
set "ROOT=%~dp0.."
call "%ROOT%\.node24\runtime\npm.cmd" %*
