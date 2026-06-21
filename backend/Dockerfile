FROM python:3.12-slim

# Python best practices
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Install system dependencies including git (required by GitPython)
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Create workspace directory for cloned repositories
RUN mkdir -p /app/workspace

# Copy and install Python dependencies
COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install -r requirements.txt

# Copy application source
COPY . .

# Make entrypoint executable
RUN chmod +x /app/entrypoint.sh

# Expose the application port
EXPOSE 8000

# Run migrations then start the FastAPI server
ENTRYPOINT ["/app/entrypoint.sh"]
