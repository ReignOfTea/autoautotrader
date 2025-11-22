import fs from 'fs';
import path from 'path';

let cachedConfig = null;

/**
 * Loads the full configuration from config.json file
 * @returns {Object} Full configuration object
 */
function loadConfig() {
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
    
    if (!config.searchConfig) {
      throw new Error('searchConfig is required in config.json');
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
 * Gets the Autotrader search configuration
 * @returns {Object} Search configuration object
 */
export function getSearchConfig() {
  const config = loadConfig();
  return config.searchConfig;
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

