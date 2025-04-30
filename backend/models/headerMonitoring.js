import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

export const HeaderMonitoring = sequelize.define('HeaderMonitoring', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  projectId: {
    type: DataTypes.STRING,
    allowNull: false,
    index: true
  },
  headerId: {
    type: DataTypes.STRING,
    allowNull: false
  },
  headerName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  threshold: {
    type: DataTypes.FLOAT,
    allowNull: true
  },
  lastDataUpdate: {
    type: DataTypes.DATE,
    allowNull: true
  },
  lastValue: {
    type: DataTypes.FLOAT,
    allowNull: true
  },
  repeatingValueCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  lastStageId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false
  },
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false
  }
}, {
  indexes: [
    {
      unique: true,
      fields: ['projectId', 'headerId']
    }
  ]
});

// Create a model for project activity tracking
export const ProjectActivity = sequelize.define('ProjectActivity', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  projectId: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  lastActiveStageId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  lastActivityAt: {
    type: DataTypes.DATE,
    allowNull: false
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  totalActiveHeaders: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  repeatingHeadersCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false
  },
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false
  }
}); 