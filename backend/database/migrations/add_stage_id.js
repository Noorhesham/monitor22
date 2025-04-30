import { getDb } from '../db.js';
import { fileURLToPath } from 'url';

async function addStageIdColumn() {
  try {
    console.log('Running migration: Adding stage_id column to active_projects table');
    
    const db = await getDb();
    
    // Check if the column exists
    const tableInfo = await db.all('PRAGMA table_info(active_projects)');
    const stageIdColumnExists = tableInfo.some(column => column.name === 'stage_id');
    
    if (!stageIdColumnExists) {
      // Add the column
      await db.exec(`
        ALTER TABLE active_projects 
        ADD COLUMN stage_id TEXT NULL
      `);
      console.log('Added stage_id column to active_projects table');
    } else {
      console.log('stage_id column already exists in active_projects table');
    }
    
    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

// Run the migration when this script is executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  addStageIdColumn()
    .then(() => {
      console.log('Migration completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

export default addStageIdColumn; 