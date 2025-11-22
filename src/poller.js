import { extractCarsFromAutotrader } from './extract.js';
import { postCarsToDiscord } from './discord-poster.js';
import { loadBotConfig } from './search-config.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * File to track which cars have been posted to Discord
 */
const POSTED_CARS_FILE = path.join(process.cwd(), 'posted-cars.json');

/**
 * Loads the list of posted car IDs
 * @returns {Promise<Set<string>>} - Set of posted car IDs
 */
async function loadPostedCars() {
  try {
    const data = await fs.readFile(POSTED_CARS_FILE, 'utf-8');
    const postedCars = JSON.parse(data);
    return new Set(postedCars);
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File doesn't exist yet, return empty set
      return new Set();
    }
    console.error('Error loading posted cars:', error.message);
    return new Set();
  }
}

/**
 * Saves the list of posted car IDs
 * @param {Set<string>} postedCars - Set of posted car IDs
 */
async function savePostedCars(postedCars) {
  try {
    const array = Array.from(postedCars);
    await fs.writeFile(POSTED_CARS_FILE, JSON.stringify(array, null, 2));
  } catch (error) {
    console.error('Error saving posted cars:', error.message);
  }
}

/**
 * Adds a car ID to the posted cars list
 * @param {Set<string>} postedCars - Set of posted car IDs
 * @param {string} carId - Car ID to add
 */
async function markCarAsPosted(postedCars, carId) {
  postedCars.add(carId);
  await savePostedCars(postedCars);
}

/**
 * Main polling function - checks for new cars and posts them to Discord
 */
async function pollForNewCars() {
  console.log('\n🔍 Starting car search...');
  console.log(`⏰ ${new Date().toLocaleString()}`);
  
  try {
    // Load bot configuration
    const botConfig = loadBotConfig();
    
    // Load list of already posted cars
    const postedCars = await loadPostedCars();
    console.log(`📋 Loaded ${postedCars.size} previously posted cars`);
    
    // Extract all cars from Autotrader
    const allCars = await extractCarsFromAutotrader();
    
    if (allCars.length === 0) {
      console.log('⚠️  No cars found in search results');
      return;
    }
    
    // Filter for new cars (not yet posted)
    const newCars = allCars.filter(car => {
      const carId = car.id || car.carId;
      return carId && !postedCars.has(carId);
    });
    
    console.log(`\n📊 Results:`);
    console.log(`   - Total cars found: ${allCars.length}`);
    console.log(`   - Already posted: ${allCars.length - newCars.length}`);
    console.log(`   - New cars: ${newCars.length}`);
    
    if (newCars.length === 0) {
      console.log('✅ No new cars to post!');
      return;
    }
    
    // Post new cars to Discord
    console.log(`\n📤 Posting ${newCars.length} new car(s) to Discord...`);
    const successCount = await postCarsToDiscord(
      botConfig.discordWebhookUrl, 
      newCars, 
      2000, 
      botConfig.discordBotToken
    );
    
    // Mark successfully posted cars
    for (const car of newCars) {
      const carId = car.id || car.carId;
      if (carId) {
        await markCarAsPosted(postedCars, carId);
      }
    }
    
    console.log(`\n✅ Posted ${successCount}/${newCars.length} cars to Discord`);
    
  } catch (error) {
    console.error('❌ Error during polling:', error);
  }
}

/**
 * Starts the polling loop
 */
export async function startPolling() {
  try {
    // Load bot configuration
    const botConfig = loadBotConfig();
    const intervalMinutes = botConfig.pollingIntervalMinutes;
    const intervalMs = intervalMinutes * 60 * 1000;
    
    console.log('🤖 AutoAutoTrader Bot Started');
    console.log(`⏱️  Polling interval: ${intervalMinutes} minutes`);
    console.log(`🔗 Discord webhook: ${botConfig.discordWebhookUrl ? 'Configured' : 'Not configured'}`);
    console.log('\n---\n');
    
    // Run immediately on start
    await pollForNewCars();
    
    // Then run on interval
    setInterval(async () => {
      await pollForNewCars();
    }, intervalMs);
    
    console.log(`\n⏳ Next check in ${intervalMinutes} minutes...`);
  } catch (error) {
    console.error('❌ Failed to start polling:', error.message);
    console.error('\n💡 Make sure you have created config.json from config.example.json');
    process.exit(1);
  }
}

// Run if executed directly
if (process.argv[1] && process.argv[1].includes('poller.js')) {
  startPolling()
    .then(() => {
      console.log('Polling started. Press Ctrl+C to stop.');
    })
    .catch(error => {
      console.error('Failed to start polling:', error);
      process.exit(1);
    });
}

export { pollForNewCars };

