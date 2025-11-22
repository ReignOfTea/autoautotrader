import { extractCarsFromAutotrader } from './extract.js';
import { postCarsToDiscord, sendSummaryMessage } from './discord-poster.js';
import { loadBotConfig, getAllSearchConfigs } from './search-config.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * File to track which cars have been posted to Discord
 * Structure: ["carId1", "carId2", ...]
 */
const POSTED_CARS_FILE = path.join(process.cwd(), 'posted-cars.json');

/**
 * Loads the list of posted car IDs
 * @returns {Promise<Set<string>>} Set of posted car IDs
 */
async function loadPostedCars() {
  try {
    const data = await fs.readFile(POSTED_CARS_FILE, 'utf-8');
    const postedCarsData = JSON.parse(data);
    
    // Handle migration from old object format to array format
    if (!Array.isArray(postedCarsData)) {
      console.log('⚠️  Migrating posted-cars.json from object to array format');
      // Extract all car IDs from all searches
      const allCarIds = [];
      for (const carIds of Object.values(postedCarsData)) {
        if (Array.isArray(carIds)) {
          allCarIds.push(...carIds);
        }
      }
      // Remove duplicates
      const uniqueCarIds = [...new Set(allCarIds)];
      await fs.writeFile(POSTED_CARS_FILE, JSON.stringify(uniqueCarIds, null, 2));
      console.log(`   ✅ Migrated ${uniqueCarIds.length} unique cars to array format`);
      return new Set(uniqueCarIds);
    }
    
    return new Set(postedCarsData);
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
 * Parses a price string and returns the numeric value
 * Handles formats like "£5,000", "5000", "£5,000.00", "Price not available", etc.
 * @param {string} priceString - Price string to parse
 * @returns {number|null} Numeric price value or null if unable to parse
 */
function parsePrice(priceString) {
  if (!priceString || typeof priceString !== 'string') {
    return null;
  }
  
  // Remove currency symbols, commas, and whitespace
  const cleaned = priceString.replace(/[£$€,\s]/g, '');
  
  // Extract first number (handles cases like "£5,000 or nearest offer")
  const match = cleaned.match(/(\d+(?:\.\d+)?)/);
  if (match) {
    return parseFloat(match[1]);
  }
  
  return null;
}

/**
 * Checks if a car's price is within the configured maximum
 * @param {Object} car - Car object with price information
 * @param {string|number} maxPrice - Maximum price from config (as string or number)
 * @returns {boolean} True if price is within limit or price cannot be determined
 */
function isPriceWithinLimit(car, maxPrice) {
  // If no max price configured, allow all cars
  if (!maxPrice) {
    return true;
  }
  
  const maxPriceNum = typeof maxPrice === 'string' ? parseFloat(maxPrice) : maxPrice;
  if (isNaN(maxPriceNum)) {
    return true; // If max price is invalid, allow the car
  }
  
  // Try to get price from car object (could be in price field)
  const carPrice = parsePrice(car.price);
  
  // If we can't parse the price, allow it (better to post than miss a good deal)
  if (carPrice === null) {
    return true;
  }
  
  return carPrice <= maxPriceNum;
}

/**
 * Processes a single search configuration
 * @param {Object} searchConfig - Search configuration object
 * @param {Object} botConfig - Bot configuration object
 * @param {Object} postedCars - Object mapping search names to Sets of posted car IDs
 */
async function processSearch(searchConfig, botConfig, postedCars) {
  const searchName = searchConfig.name || 'Unnamed Search';
  console.log(`\n🔍 Processing search: "${searchName}"`);
  
  try {
    console.log(`   📋 ${postedCars.size} previously posted cars (across all searches)`);
    
    // Extract all cars from Autotrader (pass posted cars to skip detail extraction for them)
    const allCars = await extractCarsFromAutotrader(postedCars, searchConfig);
    
    if (allCars.length === 0) {
      console.log(`   ⚠️  No cars found in search results`);
      return {
        totalFound: 0,
        newCars: 0,
        posted: 0,
        overBudget: 0
      };
    }
    
    // Filter for new cars (not yet posted)
    const newCars = allCars.filter(car => {
      const carId = car.id || car.carId;
      return carId && !postedCars.has(carId);
    });
    
    // Get max price from search config
    const maxPrice = searchConfig['price-to'];
    
    // Filter cars by price and separate into postable and over-budget
    const carsToPost = [];
    const overBudgetCars = [];
    
    for (const car of newCars) {
      if (isPriceWithinLimit(car, maxPrice)) {
        carsToPost.push(car);
      } else {
        overBudgetCars.push(car);
      }
    }
    
    console.log(`   📊 Results:`);
    console.log(`      - Total cars found: ${allCars.length}`);
    console.log(`      - Already posted: ${allCars.length - newCars.length}`);
    console.log(`      - New cars: ${newCars.length}`);
    if (maxPrice) {
      console.log(`      - Within budget (≤£${maxPrice}): ${carsToPost.length}`);
      console.log(`      - Over budget (>£${maxPrice}): ${overBudgetCars.length}`);
    }
    
    // Mark over-budget cars as posted (so we don't check them again)
    for (const car of overBudgetCars) {
      const carId = car.id || car.carId;
      if (carId) {
        await markCarAsPosted(postedCars, carId);
      }
    }
    
    if (overBudgetCars.length > 0) {
      console.log(`   ⏭️  Marked ${overBudgetCars.length} over-budget car(s) as posted (won't check again)`);
    }
    
    let successCount = 0;
    if (carsToPost.length > 0) {
      // Post cars within budget to Discord
      console.log(`   📤 Posting ${carsToPost.length} car(s) within budget to Discord...`);
      successCount = await postCarsToDiscord(
        botConfig.discordWebhookUrl, 
        carsToPost, 
        2000, 
        botConfig.discordBotToken
      );
      
      // Mark successfully posted cars
      for (const car of carsToPost) {
        const carId = car.id || car.carId;
        if (carId) {
          await markCarAsPosted(postedCars, carId);
        }
      }
      
      console.log(`   ✅ Posted ${successCount}/${carsToPost.length} cars to Discord`);
    } else {
      console.log(`   ✅ No cars within budget to post for this search!`);
    }
    
    return {
      totalFound: allCars.length,
      newCars: newCars.length,
      posted: successCount,
      overBudget: overBudgetCars.length
    };
    
  } catch (error) {
    console.error(`   ❌ Error processing search "${searchName}":`, error.message);
    return null;
  }
}

/**
 * Builds a summary message for Discord
 * @param {Array} searchResults - Array of search result objects
 * @param {number} totalCarsFound - Total cars found across all searches
 * @param {number} totalNewCars - Total new cars found
 * @param {number} totalPosted - Total cars posted to Discord
 * @param {number} totalOverBudget - Total cars over budget
 * @returns {string|null} Summary message or null if nothing to report
 */
function buildSummaryMessage(searchResults, totalCarsFound, totalNewCars, totalPosted, totalOverBudget) {
  const timestamp = new Date().toLocaleString('en-GB', { 
    timeZone: 'Europe/London',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  let message = `✅ **Check Complete** - ${timestamp}\n\n`;
  
  if (totalCarsFound === 0) {
    message += `No cars found in any search.`;
    return message;
  }
  
  message += `**Summary:**\n`;
  message += `• Total cars found: ${totalCarsFound}\n`;
  message += `• New cars: ${totalNewCars}\n`;
  
  if (totalOverBudget > 0) {
    message += `• Over budget (filtered): ${totalOverBudget}\n`;
  }
  
  if (totalPosted > 0) {
    message += `• **Posted to Discord: ${totalPosted}** 🎉\n`;
  } else {
    message += `• Posted: 0\n`;
  }
  
  // Add per-search breakdown if multiple searches
  if (searchResults.length > 1) {
    message += `\n**Per Search:**\n`;
    for (const result of searchResults) {
      message += `• ${result.name}: ${result.totalFound} found, ${result.posted} posted`;
      if (result.overBudget > 0) {
        message += `, ${result.overBudget} over budget`;
      }
      message += `\n`;
    }
  }
  
  return message;
}

/**
 * Main polling function - checks for new cars and posts them to Discord
 */
async function pollForNewCars() {
  console.log('\n🔍 Starting car searches...');
  console.log(`⏰ ${new Date().toLocaleString()}`);
  
  try {
    // Load bot configuration
    const botConfig = loadBotConfig();
    
    // Load all search configurations
    const searchConfigs = getAllSearchConfigs();
    
    if (searchConfigs.length === 0) {
      console.log('⚠️  No search configurations found in config.json');
      return;
    }
    
    console.log(`📋 Found ${searchConfigs.length} search configuration(s)`);
    
    // Load list of already posted cars (shared across all searches)
    const postedCars = await loadPostedCars();
    
    // Track summary statistics
    let totalCarsFound = 0;
    let totalNewCars = 0;
    let totalPosted = 0;
    let totalOverBudget = 0;
    const searchResults = [];
    
    // Process each search configuration
    for (let i = 0; i < searchConfigs.length; i++) {
      const searchConfig = searchConfigs[i];
      const searchName = searchConfig.name || `Search ${i + 1}`;
      console.log(`\n[${i + 1}/${searchConfigs.length}] Processing: ${searchName}`);
      console.log(`   Make: ${searchConfig.make || 'N/A'}, Model: ${searchConfig.model || 'N/A'}`);
      
      const result = await processSearch(searchConfig, botConfig, postedCars);
      if (result) {
        totalCarsFound += result.totalFound || 0;
        totalNewCars += result.newCars || 0;
        totalPosted += result.posted || 0;
        totalOverBudget += result.overBudget || 0;
        searchResults.push({
          name: searchName,
          ...result
        });
      }
      
      // Add a small delay between searches to avoid overwhelming the server
      if (i < searchConfigs.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log('\n✅ All searches completed!');
    
    // Send summary message to Discord (without notifications)
    const summaryMessage = buildSummaryMessage(searchResults, totalCarsFound, totalNewCars, totalPosted, totalOverBudget);
    if (summaryMessage) {
      await sendSummaryMessage(botConfig.discordWebhookUrl, summaryMessage);
      console.log('📊 Summary sent to Discord');
    }
    
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
    
    // Load search configurations to show count
    const searchConfigs = getAllSearchConfigs();
    
    console.log('🤖 AutoAutoTrader Bot Started');
    console.log(`⏱️  Polling interval: ${intervalMinutes} minutes`);
    console.log(`🔍 Search configurations: ${searchConfigs.length}`);
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
