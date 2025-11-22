/**
 * Discord webhook posting functionality
 */

/**
 * Maps car color names to Discord embed colors (decimal)
 * Discord embeds use decimal color values (0xRRGGBB)
 */
const colorMap = {
  'white': 0xFFFFFF,
  'black': 0x000000,
  'silver': 0xC0C0C0,
  'grey': 0x808080,
  'gray': 0x808080,
  'red': 0xFF0000,
  'blue': 0x0000FF,
  'green': 0x008000,
  'yellow': 0xFFFF00,
  'orange': 0xFFA500,
  'brown': 0xA52A2A,
  'beige': 0xF5F5DC,
  'gold': 0xFFD700,
  'bronze': 0xCD7F32,
  'purple': 0x800080,
  'pink': 0xFFC0CB,
  'navy': 0x000080,
  'maroon': 0x800000,
  'burgundy': 0x800020,
  'cream': 0xFFFDD0,
  'ivory': 0xFFFFF0,
  'pearl': 0xE8E0D5,
  'champagne': 0xF7E7CE,
  'metallic': 0x8C8C8C,
  'pearl white': 0xE8E0D5,
  'pearl black': 0x1C1C1C,
  'midnight blue': 0x191970,
  'racing green': 0x004225,
  'british racing green': 0x004225,
  'royal blue': 0x4169E1,
  'electric blue': 0x7DF9FF,
  'candy red': 0xDC143C,
  'candy blue': 0x1E90FF,
  'candy white': 0xFFFAF0,
  'titanium': 0x878681,
  'gunmetal': 0x2C3539,
  'charcoal': 0x36454F,
  'anthracite': 0x383E42
};

/**
 * Converts a color name to a Discord embed color (decimal)
 * @param {string} colorName - The color name (case-insensitive)
 * @returns {number} - Discord embed color in decimal format
 */
function getColorFromName(colorName) {
  if (!colorName) return 0x3498DB; // Default blue
  
  const normalized = colorName.toLowerCase().trim();
  
  // Direct match
  if (colorMap[normalized]) {
    return colorMap[normalized];
  }
  
  // Partial match (e.g., "Metallic Blue" contains "blue")
  for (const [key, value] of Object.entries(colorMap)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return value;
    }
  }
  
  // Try to extract base color from compound names
  const baseColors = ['white', 'black', 'red', 'blue', 'green', 'yellow', 'orange', 'brown', 'silver', 'grey', 'gray'];
  for (const baseColor of baseColors) {
    if (normalized.includes(baseColor)) {
      return colorMap[baseColor];
    }
  }
  
  // Default to blue if no match
  return 0x3498DB;
}

/**
 * Formats a car object into a Discord embed
 * @param {Object} car - Car object with all details
 * @returns {Object} - Discord embed object
 */
function createCarEmbed(car) {
  const carId = car.id || car.carId;
  const title = car.title || 'Unknown Car';
  const subtitle = car.subtitle || '';
  const fullTitle = subtitle ? `${title} - ${subtitle}` : title;
  
  // Get embed color from car color
  const embedColor = getColorFromName(car.bodyColour);
  
  // Build description with car details
  const fields = [];
  
  if (car.price) {
    fields.push({
      name: '💰 Price',
      value: car.price,
      inline: true
    });
  }
  
  if (car.mileage) {
    fields.push({
      name: '📏 Mileage',
      value: car.mileage,
      inline: true
    });
  }
  
  if (car.year || car.registration) {
    fields.push({
      name: '📅 Year',
      value: car.year || car.registration,
      inline: true
    });
  }
  
  if (car.engine) {
    fields.push({
      name: '🔧 Engine',
      value: car.engine,
      inline: true
    });
  }
  
  if (car.fuelType) {
    fields.push({
      name: '⛽ Fuel',
      value: car.fuelType,
      inline: true
    });
  }
  
  if (car.gearbox) {
    fields.push({
      name: '⚙️ Gearbox',
      value: car.gearbox,
      inline: true
    });
  }
  
  if (car.bodyType) {
    fields.push({
      name: '🚗 Body Type',
      value: car.bodyType,
      inline: true
    });
  }
  
  if (car.bodyColour) {
    fields.push({
      name: '🎨 Colour',
      value: car.bodyColour,
      inline: true
    });
  }
  
  if (car.location || car.contactLocation || car.sellerLocation) {
    fields.push({
      name: '📍 Location',
      value: car.location || car.contactLocation || car.sellerLocation,
      inline: true
    });
  }
  
  if (car.sellerName) {
    fields.push({
      name: '🏪 Seller',
      value: car.sellerName,
      inline: true
    });
  }
  
  if (car.phoneNumber) {
    fields.push({
      name: '📞 Phone',
      value: car.phoneNumber,
      inline: true
    });
  }
  
  // Build description
  let description = '';
  if (car.description) {
    // Truncate description if too long (Discord limit is 4096 chars for description)
    const maxDescLength = 1000;
    description = car.description.length > maxDescLength 
      ? car.description.substring(0, maxDescLength) + '...'
      : car.description;
  }
  
  // Get main image URL
  let imageUrl = null;
  if (car.images && car.images.length > 0) {
    imageUrl = car.images[0].full || car.images[0].thumbnail;
  } else if (car.imageUrl) {
    imageUrl = car.imageUrl;
  }
  
  const embed = {
    title: fullTitle,
    description: description || undefined,
    color: embedColor,
    fields: fields,
    url: car.link || car.url || undefined,
    timestamp: new Date().toISOString(),
    footer: {
      text: `Car ID: ${carId}`
    }
  };
  
  if (imageUrl) {
    embed.image = {
      url: imageUrl
    };
  }
  
  return embed;
}

/**
 * Creates a thread from a message in a text channel
 * @param {string} channelId - Discord channel ID
 * @param {string} messageId - Discord message ID
 * @param {string} threadName - Name for the thread
 * @param {string} botToken - Discord bot token
 * @returns {Promise<boolean>} - Success status
 */
async function createThreadFromMessage(channelId, messageId, threadName, botToken, useCanary = false) {
  try {
    // Discord API endpoint for creating a thread from a message
    // Use canary API if webhook uses canary
    const baseUrl = useCanary ? 'https://canary.discord.com' : 'https://discord.com';
    const threadUrl = `${baseUrl}/api/v10/channels/${channelId}/messages/${messageId}/threads`;
    
    console.log(`   Creating thread: ${threadName.substring(0, 50)}...`);
    console.log(`   Channel ID: ${channelId}, Message ID: ${messageId}`);
    console.log(`   Thread URL: ${threadUrl}`);
    console.log(`   Using ${useCanary ? 'canary' : 'regular'} API`);
    
    const response = await fetch(threadUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bot ${botToken}`
      },
      body: JSON.stringify({
        name: threadName.substring(0, 100) // Discord thread name limit is 100 chars
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`   ❌ Failed to create thread: ${response.status} ${response.statusText}`);
      console.error(`   Error details: ${errorText}`);
      
      // If it's a 404, the message might not exist yet or channel ID might be wrong
      if (response.status === 404) {
        console.error(`   💡 This might mean: message not found, channel not found, or bot doesn't have access`);
      }
      // If it's a 403, it's a permissions issue
      if (response.status === 403) {
        console.error(`   💡 Bot might not have "Create Public Threads" permission in this channel`);
      }
      
      return false;
    }
    
    const threadData = await response.json().catch(() => null);
    if (threadData) {
      console.log(`   ✅ Thread created successfully: ${threadData.name || threadName}`);
      console.log(`   Thread ID: ${threadData.id}`);
    } else {
      console.log(`   ✅ Thread created successfully (no response data)`);
    }
    
    return true;
  } catch (error) {
    console.error(`   ❌ Error creating thread:`, error.message);
    console.error(`   Stack:`, error.stack);
    return false;
  }
}

/**
 * Gets webhook information including channel ID
 * @param {string} webhookUrl - Discord webhook URL
 * @returns {Promise<Object|null>} - Webhook info or null
 */
async function getWebhookInfo(webhookUrl) {
  try {
    // Extract webhook ID and token from URL
    const match = webhookUrl.match(/webhooks\/(\d+)\/([^\/\?]+)/);
    if (!match) {
      console.error(`   Could not parse webhook URL: ${webhookUrl}`);
      return null;
    }
    
    const [, webhookId, webhookToken] = match;
    
    // Use the same base URL as the webhook (canary or regular)
    const baseUrl = webhookUrl.includes('canary.discord.com') 
      ? 'https://canary.discord.com' 
      : 'https://discord.com';
    
    const webhookInfoUrl = `${baseUrl}/api/v10/webhooks/${webhookId}/${webhookToken}`;
    
    console.log(`   Fetching webhook info from: ${webhookInfoUrl}`);
    
    const response = await fetch(webhookInfoUrl, {
      method: 'GET'
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`   Failed to get webhook info: ${response.status} ${response.statusText}`);
      console.error(`   Error: ${errorText}`);
      return null;
    }
    
    const webhookInfo = await response.json();
    console.log(`   Webhook info retrieved: channel_id=${webhookInfo.channel_id}`);
    return webhookInfo;
  } catch (error) {
    console.error(`   Error getting webhook info:`, error.message);
    return null;
  }
}

/**
 * Posts a car to Discord via webhook and creates a thread
 * @param {string} webhookUrl - Discord webhook URL
 * @param {Object} car - Car object to post
 * @param {string} botToken - Optional Discord bot token for thread creation
 * @returns {Promise<boolean>} - Success status
 */
export async function postCarToDiscord(webhookUrl, car, botToken = null) {
  try {
    const embed = createCarEmbed(car);
    
    // Create thread name from car title
    const carTitle = car.title || 'Unknown Car';
    const carSubtitle = car.subtitle || '';
    const threadName = carSubtitle 
      ? `${carTitle} - ${carSubtitle}`.substring(0, 100) // Discord thread name limit is 100 chars
      : carTitle.substring(0, 100);
    
    // Post message via webhook (without thread_name for text channels)
    // Add ?wait=true to get the message object back (needed for thread creation)
    const webhookUrlWithWait = webhookUrl.includes('?') 
      ? `${webhookUrl}&wait=true`
      : `${webhookUrl}?wait=true`;
    
    const payload = {
      embeds: [embed]
    };
    
    console.log(`   Posting message via webhook...`);
    const response = await fetch(webhookUrlWithWait, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to post car ${car.id || car.carId} to Discord: ${response.status} ${response.statusText}`);
      console.error(`Error: ${errorText}`);
      return false;
    }
    
    const responseData = await response.json().catch(() => null);
    console.log(`   Webhook response received, message ID: ${responseData?.id || 'N/A'}`);
    
    // Try to create a thread from the message if bot token is provided
    if (botToken && responseData && responseData.id) {
      console.log(`   Message posted with ID: ${responseData.id}`);
      
      // Get channel ID from webhook info
      const webhookInfo = await getWebhookInfo(webhookUrl);
      if (webhookInfo && webhookInfo.channel_id) {
        console.log(`   Channel ID: ${webhookInfo.channel_id}`);
        
        // Small delay to ensure message is fully processed by Discord
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const useCanary = webhookUrl.includes('canary.discord.com');
        const threadCreated = await createThreadFromMessage(
          webhookInfo.channel_id,
          responseData.id,
          threadName,
          botToken,
          useCanary
        );
        
        if (threadCreated) {
          console.log(`✅ Posted car ${car.id || car.carId} to Discord and created thread: ${threadName}`);
        } else {
          console.log(`✅ Posted car ${car.id || car.carId} to Discord (thread creation failed - check logs above)`);
        }
      } else {
        console.log(`✅ Posted car ${car.id || car.carId} to Discord`);
        console.log(`   ⚠️  Could not get channel ID from webhook info`);
        if (webhookInfo) {
          console.log(`   Webhook info:`, JSON.stringify(webhookInfo, null, 2));
        }
      }
    } else {
      console.log(`✅ Posted car ${car.id || car.carId} to Discord`);
      if (!botToken) {
        console.log(`   ℹ️  No bot token provided - thread not created. Add discordBotToken to config.json to enable threads.`);
      } else if (!responseData || !responseData.id) {
        console.log(`   ⚠️  Could not get message ID from webhook response`);
        if (responseData) {
          console.log(`   Response data:`, JSON.stringify(responseData, null, 2));
        }
      }
    }
    
    return true;
  } catch (error) {
    console.error(`Error posting car ${car.id || car.carId} to Discord:`, error.message);
    return false;
  }
}

/**
 * Posts multiple cars to Discord
 * @param {string} webhookUrl - Discord webhook URL
 * @param {Array} cars - Array of car objects
 * @param {number} delayMs - Delay between posts in milliseconds (default: 2000)
 * @param {string} botToken - Optional Discord bot token for thread creation
 * @returns {Promise<number>} - Number of successfully posted cars
 */
export async function postCarsToDiscord(webhookUrl, cars, delayMs = 2000, botToken = null) {
  let successCount = 0;
  
  for (let i = 0; i < cars.length; i++) {
    const car = cars[i];
    console.log(`[${i + 1}/${cars.length}] Posting car ${car.id || car.carId}...`);
    
    const success = await postCarToDiscord(webhookUrl, car, botToken);
    if (success) {
      successCount++;
    }
    
    // Add delay between posts to avoid rate limiting
    if (i < cars.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  return successCount;
}

/**
 * Sends a summary message to Discord without notifying members
 * @param {string} webhookUrl - Discord webhook URL
 * @param {string} message - Message content to send
 * @returns {Promise<boolean>} - Success status
 */
export async function sendSummaryMessage(webhookUrl, message) {
  try {
    // Discord flag to suppress notifications (SUPPRESS_NOTIFICATIONS = 4096)
    const payload = {
      content: message,
      flags: 4096 // Suppress notifications
    };
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to send summary message: ${response.status} ${response.statusText}`);
      console.error(`Error: ${errorText}`);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error(`Error sending summary message:`, error.message);
    return false;
  }
}

