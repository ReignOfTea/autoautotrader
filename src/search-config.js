import fs from 'fs';
import path from 'path';

let cachedConfig = null;

/**
 * Loads the full configuration from config.json file
 * @returns {Object} Full configuration object
 */
export function loadConfig() {
  if (cachedConfig) {
    return cachedConfig;
  }
  
  const configPath = path.join(process.cwd(), 'config.json');
  
  try {
    const configData = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(configData);
    
    // Validate required fields
    if (!config.discordWebhookUrl) {
      throw new Error('discordWebhookUrl is required in config.json');
    }
    
    // Support both old single searchConfig and new searchConfigs array
    if (!config.searchConfigs && !config.searchConfig) {
      throw new Error('searchConfigs or searchConfig is required in config.json');
    }
    
    // Migrate old searchConfig to searchConfigs array format
    if (config.searchConfig && !config.searchConfigs) {
      if (Array.isArray(config.searchConfig)) {
        // If searchConfig is already an array, just add names and use it
        config.searchConfigs = config.searchConfig.map((search, index) => ({
          name: search.name || `Search ${index + 1}`,
          ...search
        }));
        console.log('⚠️  Migrated searchConfig array to searchConfigs format');
      } else {
        // If searchConfig is a single object, wrap it in an array
        config.searchConfigs = [{
          name: 'Default Search',
          ...config.searchConfig
        }];
        console.log('⚠️  Migrated single searchConfig to searchConfigs array format');
      }
    }
    
    cachedConfig = config;
    return config;
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Config file not found: ${configPath}\nPlease create config.json from config.example.json`);
    }
    throw new Error(`Error loading config.json: ${error.message}`);
  }
}

/**
 * Gets all Autotrader search configurations
 * @returns {Array<Object>} Array of search configuration objects, each with a 'name' field
 */
export function getAllSearchConfigs() {
  const config = loadConfig();
  return config.searchConfigs || [];
}

/**
 * Gets a specific Autotrader search configuration by name
 * @param {string} searchName - Name of the search configuration
 * @returns {Object|null} Search configuration object or null if not found
 */
export function getSearchConfigByName(searchName) {
  const configs = getAllSearchConfigs();
  return configs.find(s => s.name === searchName) || null;
}

/**
 * Gets the first Autotrader search configuration (for backward compatibility)
 * @returns {Object} Search configuration object
 */
export function getSearchConfig() {
  const configs = getAllSearchConfigs();
  if (configs.length === 0) {
    throw new Error('No search configurations found in config.json');
  }
  return configs[0];
}

/**
 * Loads bot configuration from config.json file
 * @returns {Object} Bot configuration object
 */
export function loadBotConfig() {
  const config = loadConfig();
  
  return {
    pollingIntervalMinutes: config.pollingIntervalMinutes || 15,
    discordWebhookUrl: config.discordWebhookUrl,
    discordBotToken: config.discordBotToken || null // Optional: needed for thread creation in text channels
  };
}

