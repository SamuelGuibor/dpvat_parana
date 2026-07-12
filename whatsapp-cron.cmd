@echo off
rem O secret NUNCA deve ficar hardcoded aqui (este arquivo esta no git).
rem Defina CRON_SECRET no ambiente (mesmo valor da env na Vercel) antes de rodar.
if "%CRON_SECRET%"=="" (
  echo [ERRO] Defina a variavel de ambiente CRON_SECRET antes de rodar este script.
  exit /b 1
)
curl.exe -s "http://localhost:3000/api/whatsapp/cron?secret=%CRON_SECRET%"
