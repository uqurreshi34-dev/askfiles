Copy-Item -Recurse -Force `
  C:\Users\uqurr\Projects\askfiles\modules\media-grid\* `
  C:\Users\uqurr\Projects\media-grid-private\

Set-Location C:\Users\uqurr\Projects\media-grid-private
git add .
git commit -m "sync from main project"
git push
Set-Location C:\Users\uqurr\Projects\askfiles
