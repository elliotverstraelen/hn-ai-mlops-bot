#!/bin/bash
# Run this once on a fresh Amazon Linux 2023 t2.micro EC2 instance
set -e

# Install Docker
sudo yum update -y
sudo yum install -y docker git
sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker ec2-user

# Install Docker Compose plugin
sudo mkdir -p /usr/local/lib/docker/cli-plugins
sudo curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

# Install AWS CLI (for ECR login)
sudo yum install -y awscli

# Clone project
mkdir -p ~/hn-ai-bot
cd ~/hn-ai-bot

# Copy your .env file here manually:
# scp .env ec2-user@<your-ec2-ip>:~/hn-ai-bot/.env

# Start MLflow (bot runs via cron, not as a persistent service)
# docker compose up -d mlflow

# Set up cron to run the bot every 6 hours
(crontab -l 2>/dev/null; echo "0 */6 * * * cd ~/hn-ai-bot && docker compose run --rm bot >> ~/bot.log 2>&1") | crontab -

echo "Setup complete. MLflow will be available at http://<ec2-ip>:5000 once started."
echo "Remember to open port 5000 in your EC2 security group for your own IP."
