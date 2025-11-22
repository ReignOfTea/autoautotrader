import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';
import { getSearchConfig } from './search-config.js';
import { extractDetailsForCars } from './extract-details.js';

/**
 * Extracts car listings from Autotrader based on search criteria
 */
async function extractCarsFromAutotrader() {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu'
    ]
  });

  try {
    const page = await browser.newPage();
    
    // Set a reasonable viewport size
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Set user agent to avoid detection
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Build the Autotrader search URL with parameters
    // Based on actual Autotrader URL format from user's search
    const searchConfig = getSearchConfig();
    const searchParams = new URLSearchParams(searchConfig);

    const autotraderUrl = `https://www.autotrader.co.uk/car-search?${searchParams.toString()}`;
    
    console.log('Navigating to:', autotraderUrl);
    
    await page.goto(autotraderUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Wait for the listings to load - target the actual listing container
    await page.waitForSelector('li[data-advertid]', { timeout: 10000 }).catch(() => {
      console.log('Listings selector not found, trying alternative selectors...');
    });

    // Give the page a moment to fully render
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Extract car listings
    const cars = await page.evaluate(() => {
      const listings = [];
      
      // Target the actual listing elements based on the HTML structure
      // Each listing is an <li> with data-advertid attribute
      const listingSelectors = [
        'li[data-advertid]',
        'li[data-testid^="id-"]',
        '[data-testid="advertCard-0"]',
        '[data-testid="search-listing"]'
      ];

      let listingElements = [];
      for (const selector of listingSelectors) {
        listingElements = Array.from(document.querySelectorAll(selector));
        if (listingElements.length > 0) {
          console.log(`Found ${listingElements.length} listings using selector: ${selector}`);
          break;
        }
      }

      if (listingElements.length === 0) {
        // Fallback: try to find any listing-like elements
        listingElements = Array.from(document.querySelectorAll('li[class*="sc-mddoqs-1"]'));
        console.log(`Fallback: Found ${listingElements.length} potential listings`);
      }

      listingElements.forEach((element, index) => {
        try {
          // Extract car ID from data-advertid attribute (most reliable)
          let carId = element.getAttribute('data-advertid') || 
                      element.getAttribute('data-testid')?.replace('id-', '') ||
                      element.getAttribute('id')?.replace('id-', '');
          
          // If no ID found, try to get it from a link
          if (!carId) {
            const link = element.querySelector('a[href*="/car-details"]');
            if (link) {
              const href = link.getAttribute('href');
              const idMatch = href.match(/\/car-details\/(\d+)/);
              if (idMatch) {
                carId = idMatch[1];
              }
            }
          }

          // Extract title from the search-listing-title link
          const titleLink = element.querySelector('[data-testid="search-listing-title"]');
          const title = titleLink ? titleLink.textContent.trim() : 'Unknown';

          // Extract price - look for the price span
          const priceElement = element.querySelector('span[class*="sc-1n64n0d-8"]') ||
                              element.querySelector('[class*="price"]') ||
                              element.querySelector('.sc-1mc7cl3-16');
          const price = priceElement ? priceElement.textContent.trim() : 'Price not available';

          // Extract mileage from data-testid="mileage"
          const mileageElement = element.querySelector('[data-testid="mileage"]');
          const mileage = mileageElement ? mileageElement.textContent.trim() : 'Unknown';

          // Extract year from data-testid="registered_year"
          const yearElement = element.querySelector('[data-testid="registered_year"]');
          const year = yearElement ? yearElement.textContent.trim() : 'Unknown';

          // Extract location from data-testid="search-listing-location"
          const locationElement = element.querySelector('[data-testid="search-listing-location"]');
          const location = locationElement ? locationElement.textContent.trim() : 'Unknown';

          // Extract link from title link or first car-details link
          const carLinkElement = titleLink || element.querySelector('a[href*="/car-details"]');
          let carLink = null;
          if (carLinkElement) {
            const href = carLinkElement.getAttribute('href');
            carLink = href.startsWith('http') ? href : `https://www.autotrader.co.uk${href}`;
          }

          // Extract image - get the main image from the carousel
          const imageElement = element.querySelector('img.main-image') ||
                              element.querySelector('img[alt*="Main listing image"]') ||
                              element.querySelector('img[src*="atcdn.co.uk"]');
          const imageUrl = imageElement ? imageElement.src : null;

          // Only add if we have at least an ID or a valid title
          if (carId || (title !== 'Unknown' && title.length > 0)) {
            listings.push({
              id: carId || `temp-${index}`,
              title,
              price,
              mileage,
              year,
              location,
              link: carLink,
              imageUrl,
              extractedAt: new Date().toISOString()
            });
          }
        } catch (error) {
          console.error(`Error extracting listing ${index}:`, error);
        }
      });

      return listings;
    });

    console.log(`\nExtracted ${cars.length} car listings`);
    
    if (cars.length === 0) {
      console.log('\n⚠️  No cars found. The page structure might have changed.');
      console.log('Taking a screenshot for debugging...');
      await page.screenshot({ path: 'debug-screenshot.png', fullPage: true });
      console.log('Screenshot saved as debug-screenshot.png');

      // Also save page HTML for inspection
      const html = await page.content();
      await fs.writeFile('debug-page.html', html);
      console.log('Page HTML saved as debug-page.html');
      
      await page.close();
      return cars;
    }

    // Close the initial page as we'll use a new one for detail extraction
    await page.close();

    // Load existing extracted cars if available
    const outputPath = path.join(process.cwd(), 'extracted-cars.json');
    let existingCars = [];
    let existingCarsMap = new Map();
    
    try {
      const existingData = await fs.readFile(outputPath, 'utf-8');
      existingCars = JSON.parse(existingData);
      console.log(`\n📂 Loaded ${existingCars.length} existing cars from ${outputPath}`);
      
      // Create a map of existing cars by ID for quick lookup
      existingCars.forEach(car => {
        const carId = car.id || car.carId;
        if (carId) {
          existingCarsMap.set(carId, car);
        }
      });
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.log(`\n⚠️  Could not read existing file: ${error.message}`);
      } else {
        console.log('\n📂 No existing data file found, will create new one');
      }
    }

    // Separate cars into those that need detail extraction and those that don't
    const carsToExtract = [];
    const carsWithDetails = [];
    
    cars.forEach(car => {
      const carId = car.id || car.carId;
      const existingCar = existingCarsMap.get(carId);
      
      // Check if car already has detailed information
      // A car has details if it has images array, description, or seller info
      if (existingCar && (
        (existingCar.images && existingCar.images.length > 0) ||
        existingCar.description ||
        existingCar.sellerName ||
        existingCar.engine
      )) {
        // Car already has details, use existing data but update basic info
        carsWithDetails.push({
          ...existingCar,
          ...car, // Update with any new basic info from listing
          // Preserve detailed fields from existing data
          images: existingCar.images || car.images,
          description: existingCar.description,
          sellerName: existingCar.sellerName,
          sellerLocation: existingCar.sellerLocation,
          contactLocation: existingCar.contactLocation,
          phoneNumber: existingCar.phoneNumber,
          engine: existingCar.engine,
          fuelType: existingCar.fuelType,
          gearbox: existingCar.gearbox,
          doors: existingCar.doors,
          seats: existingCar.seats,
          emissionClass: existingCar.emissionClass,
          bodyColour: existingCar.bodyColour,
          registration: existingCar.registration
        });
      } else {
        // Car needs detail extraction
        carsToExtract.push(car);
      }
    });

    console.log(`\n📊 Summary:`);
    console.log(`   - Total cars found: ${cars.length}`);
    console.log(`   - Already have details: ${carsWithDetails.length}`);
    console.log(`   - Need detail extraction: ${carsToExtract.length}`);

    // Extract detailed information only for cars that need it
    let newlyExtractedCars = [];
    if (carsToExtract.length > 0) {
      console.log('\n📋 Extracting detailed information for new cars...');
      newlyExtractedCars = await extractDetailsForCars(browser, carsToExtract);
    } else {
      console.log('\n✅ All cars already have detailed information!');
    }

    // Combine all cars: existing with details + newly extracted
    const detailedCars = [...carsWithDetails, ...newlyExtractedCars];

    // Log the first few cars for debugging
    console.log('\n✅ Detailed extraction complete!');
    console.log('\nSample listings:');
    detailedCars.slice(0, 3).forEach((car, index) => {
      console.log(`\n${index + 1}. ${car.title || car.subtitle || 'Unknown'}`);
      console.log(`   ID: ${car.id || car.carId}`);
      console.log(`   Price: ${car.price || 'N/A'}`);
      console.log(`   Mileage: ${car.mileage || 'N/A'}`);
      console.log(`   Year: ${car.year || car.registration || 'N/A'}`);
      console.log(`   Engine: ${car.engine || 'N/A'}`);
      console.log(`   Fuel: ${car.fuelType || 'N/A'}`);
      console.log(`   Images: ${car.images ? car.images.length : 0} found`);
      console.log(`   Seller: ${car.sellerName || 'N/A'}`);
      console.log(`   Location: ${car.contactLocation || car.sellerLocation || 'N/A'}`);
      console.log(`   Link: ${car.link || car.url || 'N/A'}`);
    });
    
    // Save extracted data to file for inspection
    await fs.writeFile(outputPath, JSON.stringify(detailedCars, null, 2));
    console.log(`\n💾 Saved ${detailedCars.length} detailed listings to ${outputPath}`);

    return detailedCars;

  } catch (error) {
    console.error('Error extracting cars:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

// Run the extraction if this file is executed directly
if (process.argv[1] && process.argv[1].includes('extract.js')) {
  extractCarsFromAutotrader()
    .then(cars => {
      console.log(`\n✅ Extraction complete! Found ${cars.length} cars.`);
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Extraction failed:', error);
      process.exit(1);
    });
}

export { extractCarsFromAutotrader };
