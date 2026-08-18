if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    $answer = Read-Host "Node.js가 설치되어 있지 않습니다. 관리자 권한으로 지금 설치할까요? (Y/N)"
    if ($answer -eq "Y" -or $answer -eq "y") {
        Start-Process powershell -Verb RunAs -Wait -ArgumentList "-NoProfile", "-Command", "winget install -e --id OpenJS.NodeJS.LTS"
        Write-Host "설치 완료. 새 터미널(새 PATH 반영)에서 이 작업을 다시 실행해주세요."
        exit 0
    } else {
        Write-Host "Node.js 설치가 필요합니다: https://nodejs.org"
        exit 1
    }
}

npm run dist
