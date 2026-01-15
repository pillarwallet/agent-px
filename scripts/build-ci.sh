#!/bin/bash
set -e

echo "Starting build script..."

# Configure git if GITHUB_TOKEN is present
if [ -n "$GITHUB_TOKEN" ]; then
  echo "Configuring git with GITHUB_TOKEN..."
  git config --global url."https://${GITHUB_TOKEN}@github.com/".insteadOf "ssh://git@github.com"
  git config --global url."https://${GITHUB_TOKEN}@github.com/".insteadOf "git@github.com:"
  git config --global url."https://${GITHUB_TOKEN}@github.com/".insteadOf "https://github.com/"
  git config --global --add protocol.ssh.allow never
else
  echo "GITHUB_TOKEN not set, skipping git configuration."
fi

echo "Installing dependencies..."
npm ci

echo "Building project..."
npm run build
