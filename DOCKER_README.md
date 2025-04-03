# Running Stoic Mentor with Docker

This guide explains how to run the Stoic Mentor application using Docker for the backend with Kokoro TTS.

## Prerequisites

- [Docker](https://www.docker.com/get-started) installed on your system
- [Docker Compose](https://docs.docker.com/compose/install/) (usually included with Docker Desktop)

## Setup

1. **Clone the repository** (if you haven't already):
   ```bash
   git clone <repository_url>
   cd stoic-mentor
   ```

2. **Build and start the Docker container**:
   ```bash
   docker-compose up --build
   ```
   This will build the Docker image for the backend and start the service. The first build might take some time as it installs all dependencies.

3. **Run the frontend** (in a separate terminal):
   ```bash
   npm install  # Only needed on first run
   npm run dev
   ```

4. **Access the application**:
   - The frontend will be available at `http://localhost:5173` (or the port shown in your terminal)
   - The backend API will be available at `http://localhost:5002`

## Configuration

Make sure your `.env` file has:
```
VITE_USE_DIRECT_TTS=false
VITE_MOCK_API_URL=http://localhost:5002
```

This will ensure the frontend uses the backend for TTS generation.

## Stopping the Application

1. Press `Ctrl+C` in the terminal running the Docker container
2. To completely stop and remove containers:
   ```bash
   docker-compose down
   ```

## Troubleshooting

- **Backend not responding**: Make sure the Docker container is running with `docker ps`
- **TTS not working**: Check Docker logs with `docker-compose logs backend`
- **Permissions issues**: You might need to run docker commands with `sudo` on some systems 