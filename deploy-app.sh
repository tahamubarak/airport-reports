#!/usr/bin/env bash
# Build and deploy the app to Azure App Service
set -e

APP_NAME="airport-reports-app"
RESOURCE_GROUP="airport-reports-rg"

echo "=== Building React frontend ==="
npm run build

echo "=== Building API ==="
cd api && npm install && npm run build && cd ..

echo "=== Creating deployment zip ==="
zip -r deploy.zip dist/ api/dist/ api/node_modules/ api/package.json package.json --exclude "*.git*"

echo "=== Deploying to Azure App Service ==="
az webapp deployment source config-zip \
  --resource-group $RESOURCE_GROUP \
  --name $APP_NAME \
  --src deploy.zip

rm deploy.zip
echo "=== Deployed! Visit https://${APP_NAME}.azurewebsites.net ==="
