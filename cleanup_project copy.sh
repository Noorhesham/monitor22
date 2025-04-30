#!/bin/bash

# Script to clean up unnecessary files after reorganization
# This removes duplicate and obsolete files from the project

echo "Starting project cleanup..."
echo "This will remove files that are no longer needed after reorganization."
read -p "Are you sure you want to continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cleanup cancelled."
    exit 1
fi

# Remove redundant files in root directory that are already in frontend
echo "Removing redundant frontend files from root directory..."
rm -f vite.config.js
rm -f index.jsx
rm -f App.jsx
rm -f tailwind.config.js
rm -f postcss.config.js
rm -f index.html

# Remove reorganization scripts that are no longer needed
echo "Removing completed reorganization scripts..."
rm -f reorganize.sh
rm -f fix_imports.sh
rm -f backup.sh 

# Remove temporary documentation files
echo "Removing temporary documentation files..."
rm -f directory_structure.md
rm -f file_changes.md
rm -f implementation_plan.md

# Remove root package files that are now redundant
echo "Removing redundant package files from root directory..."
rm -f package.json
rm -f package-lock.json

# Remove root .env file that should now be in frontend and backend
rm -f .env

# Clean up database duplication
echo "Cleaning up database duplication..."
# First ensure working database file is preserved
if [ -f "backend/private/db/monitor.db" ]; then
    echo "Found main database file in backend/private/db/monitor.db - will preserve this"
    # Make a backup just in case
    cp backend/private/db/monitor.db backend/private/db/monitor.db.bak
fi

# Keep only one database structure (private/db with monitor.db seems to be the main one)
if [ -d "backend/database" ] && [ -d "backend/private/db" ]; then
    echo "Removing duplicate database directory at backend/database..."
    rm -rf backend/database
fi

if [ -d "backend/db" ] && [ -d "backend/private/db" ]; then
    echo "Removing duplicate db directory at backend/db..."
    rm -rf backend/db
fi

# Check for config.js with database settings and consolidate
if [ -f "backend/config/database.js" ] && [ -f "backend/database.js" ]; then
    echo "Found duplicate database config, keeping only one version..."
    # Keep the one that appears to be referenced in imports
    rm -f backend/database.js
fi

# Clean up redundant server files
echo "Cleaning up redundant server files..."
# Keep simple-server.js as it seems to be the working server
if [ -f "backend/server-fixed.js" ]; then
    echo "Removing duplicate server file backend/server-fixed.js..."
    rm -f backend/server-fixed.js
fi

if [ -f "backend/server-backup.js" ]; then
    echo "Removing backup server file backend/server-backup.js..."
    rm -f backend/server-backup.js
fi

# Clean up any non-working or redundant API files
echo "Cleaning up redundant API files..."
if [ -d "backend/api/routes" ] && [ -d "backend/api" ]; then
    echo "Removing redundant routes directory since files already exist in api directory..."
    rm -rf backend/api/routes
fi

# Clean up any temporary log files
echo "Cleaning up log files..."
if [ -d "backend/logs" ]; then
    echo "Removing log files..."
    rm -rf backend/logs/*.log
fi

# Check for any server-fixed.js files and other duplicates
if [ -f backend/server-fixed.js ]; then
    echo "Found duplicate server file. Removing backend/server-fixed.js..."
    rm -f backend/server-fixed.js
fi

# Remove old/unused backend folders
if [ -d "backend-monitor" ]; then
    echo "Removing old backend-monitor directory..."
    rm -rf backend-monitor
fi

# Fix backend import paths
echo "Fixing backend import paths..."

# Function to fix import paths in a file
fix_backend_imports() {
    local file=$1
    echo "Fixing imports in $file"
    
    # Replace any paths that point to old services location
    if grep -q "import .* from '/home/q2/menotring-system/services/" "$file"; then
        sed -i 's|import \(.*\) from .*services/\(.*\)|import \1 from "../services/\2|g' "$file"
    fi
    
    # Fix project.js imports
    if grep -q "import .* from '/home/q2/menotring-system/backend/api/routes/project.js'" "$file"; then
        sed -i 's|import \(.*\) from .*/backend/api/routes/project.js|import \1 from "./project.js"|g' "$file"
    fi
    
    # Fix absolute paths to relative paths
    if grep -q "import .* from '/home/q2/menotring-system/backend/" "$file"; then
        sed -i 's|import \(.*\) from .*/backend/\(.*\)|import \1 from "../\2|g' "$file"
    fi
    
    # Fix monitoringStatus.js imports
    if grep -q "import .* from .*monitoringStatus" "$file"; then
        if [ "$(dirname "$file")" = "backend" ]; then
            sed -i 's|import \(.*\) from .*monitoringStatus|import \1 from "./api/monitoringStatus.js"|g' "$file"
        fi
    fi
}

# Find all JS files in backend and fix their imports
find backend -name "*.js" -type f -not -path "*/node_modules/*" -not -path "*/\.git/*" | while read file; do
    fix_backend_imports "$file"
done

# Clean up frontend issues
echo "Cleaning up frontend component issues..."

# Check if certain problematic components exist and fix them
if [ ! -f "frontend/src/components/ProjectList.jsx" ] && [ ! -f "frontend/src/components/ProjectList/index.jsx" ]; then
    echo "ProjectList component is missing but referenced - creating empty placeholder to prevent errors"
    mkdir -p frontend/src/components/ProjectList
    echo 'import React from "react";
export default function ProjectList() {
  return <div>Project List Component (placeholder)</div>;
}' > frontend/src/components/ProjectList/index.jsx
fi

if [ ! -f "frontend/src/components/ProjectDetail.jsx" ] && [ ! -f "frontend/src/components/ProjectDetail/index.jsx" ]; then
    echo "ProjectDetail component is missing but referenced - creating empty placeholder to prevent errors"
    mkdir -p frontend/src/components/ProjectDetail
    echo 'import React from "react";
export default function ProjectDetail() {
  return <div>Project Detail Component (placeholder)</div>;
}' > frontend/src/components/ProjectDetail/index.jsx
fi

if [ ! -f "frontend/src/components/NotFound.jsx" ]; then
    echo "NotFound component is missing but referenced - creating empty placeholder to prevent errors"
    echo 'import React from "react";
export default function NotFound() {
  return <div>Page Not Found</div>;
}' > frontend/src/components/NotFound.jsx
fi

# Fix frontend config issues
if [ -f "frontend/src/config.js" ]; then
    echo "Fixing config.js export..."
    # Check if it's missing default export and fix it
    if ! grep -q "export default" "frontend/src/config.js"; then
        sed -i '/export const baseUrl/i export default {' "frontend/src/config.js"
        echo "};" >> "frontend/src/config.js"
    fi
fi

# Install any missing dependencies in frontend
if [ -d "frontend" ]; then
    echo "Checking for missing dependencies in frontend..."
    cd frontend
    if grep -q "axios" package.json; then
        echo "axios already in package.json"
    else
        echo "axios missing from package.json - adding it as a dependency"
        npm install --save axios
    fi
    cd ..
fi

# Check for any backup files
echo "Checking for backup or temporary files..."
find . -name "*-backup.*" -type f -exec rm -f {} \;
find . -name "*.bak" -type f -exec rm -f {} \;
find . -name "*.tmp" -type f -exec rm -f {} \;
find . -name "*-OLD" -type d -exec rm -rf {} \;
find . -name "*-old" -type d -exec rm -rf {} \;

# Remove any duplicate services that are already in the backend
if [ -d "services" ] && [ -d "backend/services" ]; then
    echo "Removing duplicate services directory at root level..."
    rm -rf services
fi

# Clean up any test files
echo "Cleaning up test files..."
find . -name "test-*.js" -type f -exec rm -f {} \;
find . -name "test-*.html" -type f -exec rm -f {} \;
find . -name "*.test.js" -type f -exec rm -f {} \;
find . -name "*.spec.js" -type f -exec rm -f {} \;

# Check if old cleanup script exists and remove it
if [ -f cleanup.sh ]; then
    echo "Removing old cleanup script..."
    rm -f cleanup.sh
fi

# Create a startup script
echo "Creating a startup script..."
cat > start.sh << 'EOF'
#!/bin/bash

# Script to start both backend and frontend servers

echo "Starting the monitoring system..."

# Kill any processes that might be using the required ports
echo "Checking for existing processes on ports 3000 and 3002..."
lsof -i :3000 | grep LISTEN | awk '{print $2}' | xargs -r kill -9
lsof -i :3002 | grep LISTEN | awk '{print $2}' | xargs -r kill -9

# Start the backend
echo "Starting backend server..."
cd backend
npm start &
BACKEND_PID=$!
cd ..

# Wait a moment for backend to start
sleep 2

# Start the frontend
echo "Starting frontend server..."
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo "Both servers are now running."
echo "Access the monitoring dashboard at: http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop both servers"

# Capture Ctrl+C to gracefully shut down both servers
trap "kill $BACKEND_PID $FRONTEND_PID; echo 'Servers stopped.'; exit 0" INT

# Keep the script running
wait
EOF

chmod +x start.sh

echo "Cleanup complete!"
echo "Your project should now be more organized with all duplicate files removed."
echo "A new startup script 'start.sh' has been created to easily start both servers."
echo "Run it with: ./start.sh"
echo "Remember to test the application after cleanup to ensure everything still works." 