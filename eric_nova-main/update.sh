#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

echo "Navigating to home directory..."
cd ~

PROJECT_DIR="eric_nova"
ENV_FILE=".env"
BACKUP_ENV_FILE=".env.bak"
REPO_URL="https://github.com/cat903/eric_nova.git"
AUTOSHUTSTATUS="autoshutoff.control"
DATABASE_FILE="orders.db"

# --- Backup ---
# Check if the project directory and .env file exist
if [ -d "$PROJECT_DIR" ] && [ -f "$PROJECT_DIR/$ENV_FILE" ]; then
    echo "Backing up existing $ENV_FILE file from $PROJECT_DIR/ to ~/$BACKUP_ENV_FILE..."
    # Use -p to preserve permissions and ownership if possible
    cp -p "$PROJECT_DIR/$ENV_FILE" "$BACKUP_ENV_FILE"
else
    echo "No existing $PROJECT_DIR/$ENV_FILE found to back up."
fi

if [ -d "$PROJECT_DIR" ] && [ -f "$PROJECT_DIR/$AUTOSHUTSTATUS" ]; then
    echo "Backing up existing $AUTOSHUTSTATUS file from $AUTOSHUTSTATUS/ to ~/$AUTOSHUTSTATUS..."
    # Use -p to preserve permissions and ownership if possible
    cp -p "$PROJECT_DIR/$AUTOSHUTSTATUS" "$AUTOSHUTSTATUS"
else
    echo "No existing $PROJECT_DIR/$AUTOSHUTSTATUS found to back up."
fi

if [ -d "$PROJECT_DIR" ] && [ -f "$PROJECT_DIR/$DATABASE_FILE" ]; then
    echo "Backing up existing $DATABASE_FILE file from $PROJECT_DIR/ to ~/orders.db..."
    cp -p "$PROJECT_DIR/$DATABASE_FILE" "orders.db"
else
    echo "No existing $PROJECT_DIR/$DATABASE_FILE found to back up."
fi

# --- Cleanup ---
echo "Removing existing $PROJECT_DIR folder..."
rm -rf "$PROJECT_DIR"

# --- Clone ---
echo "Cloning fresh repository from $REPO_URL..."
git clone "$REPO_URL" "$PROJECT_DIR" # Clone into the specific directory name
cd "$PROJECT_DIR"
echo "Changed directory to $(pwd)"

# --- Restore ---
# Check if the backup file exists in the home directory
if [ -f "../$BACKUP_ENV_FILE" ]; then
    echo "Restoring $ENV_FILE from backup..."
    mv "../$BACKUP_ENV_FILE" "$ENV_FILE"
else
    echo "No backup file (~/$BACKUP_ENV_FILE) found to restore."
    # Optional: Create an empty .env if no backup exists and one is always needed
    # touch "$ENV_FILE"
    # echo "Created an empty $ENV_FILE as no backup was found."
fi

if [ -f "../$AUTOSHUTSTATUS" ]; then
    echo "Restoring $AUTOSHUTSTATUS from backup..."
    mv "../$AUTOSHUTSTATUS" "$AUTOSHUTSTATUS"
else
    echo "No backup file (~/$AUTOSHUTSTATUS) found to restore."
    # Optional: Create an empty .env if no backup exists and one is always needed
    # touch "$ENV_FILE"
    # echo "Created an empty $ENV_FILE as no backup was found."
fi

if [ -f "../$DATABASE_FILE" ]; then
    echo "Restoring $DATABASE_FILE from backup..."
    mv "../$DATABASE_FILE" "$DATABASE_FILE"
else
    echo "No backup file (~/$DATABASE_FILE) found to restore."
fi

# --- Environment Setup (NVM) ---
echo "Loading NVM..."
export NVM_DIR="$HOME/.nvm"
# Check if NVM script exists and source it
if [ -s "$NVM_DIR/nvm.sh" ]; then
    \. "$NVM_DIR/nvm.sh"
    echo "NVM sourced successfully."
    # Optional: Add 'nvm use' here if your project needs a specific Node version defined in .nvmrc
    # if [ -f ".nvmrc" ]; then nvm use; fi
    echo "Using Node version: $(node -v)"
    echo "Using npm version: $(npm -v)"
else
    echo "Warning: NVM script not found at $NVM_DIR/nvm.sh. Ensure NVM is installed correctly."
    # Consider exiting if Node/NPM are critical and not found in PATH
    # if ! command -v node > /dev/null || ! command -v npm > /dev/null; then
    #    echo "Error: Node or npm not found. Exiting."
    #    exit 1
    # fi
fi
# Source NVM bash completion if it exists
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"

# --- Install/Update Tools ---
echo "Installing/Updating PM2 globally..."
# Use --no-fund to potentially speed up install by skipping funding messages
npm install pm2 -g --no-fund

# --- Install Project Dependencies ---
echo "Installing project dependencies..."
# Use --no-fund and --omit=dev if devDependencies aren't needed for production
npm install --omit=dev --no-fund

# --- PM2 Operations ---
echo "Updating PM2 daemon..."
pm2 update

echo "Starting/Restarting application with PM2 using ecosystem.config.js..."
# Use startOrRestart for robustness: starts if not running, restarts if already running.
# Ensure 'ecosystem.config.js' exists and is correctly configured.
if [ -f "ecosystem.config.js" ]; then
    pm2 startOrRestart ecosystem.config.js
else
    echo "Error: ecosystem.config.js not found! Cannot start application."
    exit 1
fi

echo "Application update and start/restart process complete."
pm2 list # Show status of applications managed by PM2

# --- Clear Screen and Conditional .env Update ---
clear
read -r -p "Do you want to update the .env file (username, password, webhook, platform, allow registration)? (y/N): " UPDATE_CHOICE

# Convert choice to lowercase for case-insensitive comparison (Y/y)
# Default to 'n' if user just presses Enter
UPDATE_CHOICE_LOWER=$(echo "${UPDATE_CHOICE:-n}" | tr '[:upper:]' '[:lower:]')

if [ "$UPDATE_CHOICE_LOWER" = "y" ]; then
    echo "Proceeding with .env update..."

    read -r -p "Please enter your username: " USERNAME

    # Prompt for password securely
    PASSWORD="" # Reset password variable
    while [ -z "$PASSWORD" ]; do
        echo -n "Please enter your password (input hidden): "
        stty -echo # Disable terminal echo
        read PASSWORD
        stty echo # Re-enable terminal echo
        echo # Print a newline after password input
        if [ -z "$PASSWORD" ]; then
            echo "Password cannot be empty. Please try again."
        fi
    done


    read -r -p "Please enter your Discord webhook URL: " DISCORD

    read -r -p "Please enter your Desired Platform: " PLATFORM

    read -r -p "Allow new user registrations? (true/false): " ALLOW_REGISTRATION

    echo "Creating/Overwriting .env file with new credentials..."
    # WARNING: This overwrites the entire .env file. Any other variables
    # previously in .env (restored from backup) will be lost unless added here.
    {
      echo "USERE=$USERNAME"
      echo "USERP=$PASSWORD"
      echo "DISCORDWEBHOOK=$DISCORD"
      echo "PLATFORM=$PLATFORM"
      echo "ALLOW_REGISTRATION=$ALLOW_REGISTRATION"
      # Add any other essential default variables here if needed
    } > "$ENV_FILE" # Ensure this writes to the correct .env file path in the current directory

    echo ".env file updated successfully."
    
    pm2 restart all

else
    echo "Skipping .env file update. The existing .env file (if any) remains unchanged."
fi

clear

echo "Script finished updating"