#!/usr/bin/env bash
# Azure App Service deployment script
# Usage: bash swa-deploy.sh

set -e

SUBSCRIPTION="af7ab49c-02a5-4000-afc0-dbdf378f9a0d"
RESOURCE_GROUP="airport-reports-rg"
LOCATION="eastus"
SQL_SERVER="airport-reports-sql"
SQL_DB="airport-reports"
SQL_ADMIN="sqladmin"
APP_SERVICE_PLAN="airport-reports-plan"
APP_NAME="airport-reports-app"

echo "=== Step 1: Set subscription ==="
az account set --subscription $SUBSCRIPTION

echo "=== Step 2: Create resource group ==="
az group create --name $RESOURCE_GROUP --location $LOCATION

echo "=== Step 3: Create Azure SQL server ==="
echo "Enter a strong password for SQL admin:"
read -s SQL_PASSWORD

az sql server create \
  --name $SQL_SERVER \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION \
  --admin-user $SQL_ADMIN \
  --admin-password "$SQL_PASSWORD"

echo "=== Step 4: Create SQL database (Basic tier ~\$5/mo) ==="
az sql db create \
  --resource-group $RESOURCE_GROUP \
  --server $SQL_SERVER \
  --name $SQL_DB \
  --service-objective Basic

echo "=== Step 5: Allow Azure services to access SQL ==="
az sql server firewall-rule create \
  --resource-group $RESOURCE_GROUP \
  --server $SQL_SERVER \
  --name AllowAzureServices \
  --start-ip-address 0.0.0.0 \
  --end-ip-address 0.0.0.0

echo "=== Step 6: Create App Service plan (B1 ~\$13/mo) ==="
az appservice plan create \
  --name $APP_SERVICE_PLAN \
  --resource-group $RESOURCE_GROUP \
  --sku B1 \
  --is-linux

echo "=== Step 7: Create Node.js Web App ==="
az webapp create \
  --resource-group $RESOURCE_GROUP \
  --plan $APP_SERVICE_PLAN \
  --name $APP_NAME \
  --runtime "NODE:20-lts"

echo "=== Step 8: Configure environment variables ==="
SQL_CONN="Server=tcp:${SQL_SERVER}.database.windows.net,1433;Database=${SQL_DB};User ID=${SQL_ADMIN};Password=${SQL_PASSWORD};Encrypt=yes;TrustServerCertificate=no;Connection Timeout=30;"
JWT_SECRET=$(openssl rand -hex 32)

az webapp config appsettings set \
  --resource-group $RESOURCE_GROUP \
  --name $APP_NAME \
  --settings \
    SQL_CONNECTION_STRING="$SQL_CONN" \
    JWT_SECRET="$JWT_SECRET" \
    NODE_ENV="production" \
    PORT="8080" \
    WEBSITE_NODE_DEFAULT_VERSION="~20"

echo "=== Step 9: Set startup command ==="
az webapp config set \
  --resource-group $RESOURCE_GROUP \
  --name $APP_NAME \
  --startup-file "node api/dist/index.js"

echo ""
echo "=== DONE: Azure resources created ==="
echo "App URL: https://${APP_NAME}.azurewebsites.net"
echo "SQL Server: ${SQL_SERVER}.database.windows.net"
echo ""
echo "Next steps:"
echo "1. Run schema.sql against your database"
echo "2. Run: bash deploy-app.sh to build and deploy the app"
