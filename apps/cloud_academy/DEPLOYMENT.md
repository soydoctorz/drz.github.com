# Deployment Guide for Render

## Prerequisites
- Docker installed locally (for testing)
- Render account
- Git repository with the code

## Docker Configuration

### Build the Docker Image Locally (Testing)
```bash
docker build -t cloud-academy .
```

### Run the Docker Container Locally
```bash
docker run -p 3000:3000 cloud-academy
```

The application will be available at `http://localhost:3000`

## Deploying to Render

### Step 1: Push to Git Repository
Make sure your code is pushed to a Git repository (GitHub, GitLab, or Bitbucket).

### Step 2: Create a New Web Service on Render
1. Go to your Render dashboard
2. Click "New +" → "Web Service"
3. Connect your Git repository
4. Select the repository containing this project

### Step 3: Configure the Service
- **Name**: `cloud-academy` (or your preferred name)
- **Environment**: `Docker`
- **Region**: Choose the closest region to your users
- **Branch**: `main` (or your default branch)
- **Root Directory**: Leave empty (or specify if your project is in a subdirectory)

### Step 4: Docker Settings
- **Dockerfile Path**: `Dockerfile` (default)
- **Docker Context**: `.` (default)

### Step 5: Environment Variables
No environment variables are required for basic deployment. If you need to add any later:
- Go to Environment tab
- Add variables as needed

### Step 6: Deploy
Click "Create Web Service" and Render will:
1. Build the Docker image
2. Deploy the container
3. Make it available at `https://your-service-name.onrender.com`

## Port Configuration
The application is configured to run on port **3000** as specified in the Dockerfile.

## Health Check
Render will automatically check the health of your service by pinging the root endpoint.

## Troubleshooting

### Build Fails
- Check that `next.config.js` has `output: 'standalone'`
- Verify all dependencies are in `package.json`
- Check build logs in Render dashboard

### Container Starts but App Doesn't Load
- Verify port 3000 is exposed in Dockerfile
- Check Render logs for errors
- Ensure `HOSTNAME` is set to `0.0.0.0` in Dockerfile

### Static Assets Not Loading
- Verify `public/` directory is copied correctly in Dockerfile
- Check that `.next/static` is copied in Dockerfile

### Deprecation Warnings During Build
You may see deprecation warnings like:
- `rimraf@3.0.2`
- `eslint@8.57.1`
- `glob@7.2.3`
- etc.

**These warnings are harmless** - they come from transitive dependencies (dependencies of dependencies) used by Next.js and ESLint. They don't affect functionality or security. The `.npmrc` file is configured to minimize these warnings during Docker builds.

## Notes
- The Dockerfile uses multi-stage builds for optimal image size
- The final image only contains production dependencies
- The app runs as a non-root user (`nextjs`) for security
- Deprecation warnings from transitive dependencies are expected and can be safely ignored
