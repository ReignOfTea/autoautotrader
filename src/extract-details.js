import puppeteer from 'puppeteer';

/**
 * Extracts detailed information from a single car detail page
 * @param {Page} page - Puppeteer page object
 * @param {string} carUrl - URL of the car detail page
 * @param {string} carId - Car ID
 * @returns {Promise<Object>} Detailed car information
 */
export async function extractCarDetails(page, carUrl, carId) {
  try {
    console.log(`  Extracting details for car ${carId}...`);
    
    await page.goto(carUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Wait for key elements to load
    await page.waitForSelector('[data-testid="advert-price"]', { timeout: 10000 }).catch(() => {
      console.log(`    Warning: Price element not found for car ${carId}`);
    });

    // Give the page a moment to fully render
    await new Promise(resolve => setTimeout(resolve, 1500));

    const details = await page.evaluate(() => {
      const data = {};

      // Extract price
      const priceElement = document.querySelector('[data-testid="advert-price"]');
      data.price = priceElement ? priceElement.textContent.trim() : null;

      // Extract title and subtitle
      const titleElement = document.querySelector('h1.sc-d2fm32-4');
      data.title = titleElement ? titleElement.textContent.trim() : null;

      const subtitleElement = document.querySelector('.sc-d2fm32-6');
      data.subtitle = subtitleElement ? subtitleElement.textContent.trim() : null;

      // Extract overview details from the overview section
      const overviewSection = document.querySelector('[data-testid="overview"]');
      if (overviewSection) {
        const overviewItems = overviewSection.querySelectorAll('.sc-1r1x5mr-1');
        
        overviewItems.forEach(item => {
          const labelElement = item.querySelector('.sc-1r1x5mr-5');
          const valueElement = item.querySelector('.sc-1r1x5mr-6');
          
          if (labelElement && valueElement) {
            const label = labelElement.textContent.trim();
            const value = valueElement.textContent.trim();
            
            // Map labels to data fields
            if (label.toLowerCase().includes('mileage')) {
              data.mileage = value;
            } else if (label.toLowerCase().includes('registration')) {
              data.registration = value;
            } else if (label.toLowerCase().includes('fuel')) {
              data.fuelType = value;
            } else if (label.toLowerCase().includes('body type')) {
              data.bodyType = value;
            } else if (label.toLowerCase().includes('engine')) {
              data.engine = value;
            } else if (label.toLowerCase().includes('gearbox')) {
              data.gearbox = value;
            } else if (label.toLowerCase().includes('doors')) {
              data.doors = value;
            } else if (label.toLowerCase().includes('seats')) {
              data.seats = value;
            } else if (label.toLowerCase().includes('emission')) {
              data.emissionClass = value;
            } else if (label.toLowerCase().includes('colour') || label.toLowerCase().includes('color')) {
              data.bodyColour = value;
            }
          }
        });
      }

      // Extract description
      const descriptionSection = document.querySelector('[data-testid="description"]');
      if (descriptionSection) {
        const descriptionElement = descriptionSection.querySelector('.sc-cvt0mw-1');
        data.description = descriptionElement ? descriptionElement.textContent.trim() : null;
      }

      // Extract all images from gallery
      data.images = [];
      const gallerySection = document.querySelector('[data-testid="gallery"]');
      if (gallerySection) {
        // Find all image elements
        const imageElements = gallerySection.querySelectorAll('img[src*="atcdn.co.uk"]');
        imageElements.forEach(img => {
          const src = img.getAttribute('src');
          if (src && !data.images.includes(src)) {
            // Try to get higher resolution version
            const highResSrc = src.replace(/w\d+/, 'w800').replace(/w\d+/, 'w800');
            data.images.push({
              thumbnail: src,
              full: highResSrc
            });
          }
        });

        // Also try to get images from source elements
        const sourceElements = gallerySection.querySelectorAll('source[srcset*="atcdn.co.uk"]');
        sourceElements.forEach(source => {
          const srcset = source.getAttribute('srcset');
          if (srcset) {
            // Extract the highest resolution URL from srcset
            const urls = srcset.split(',').map(s => s.trim().split(' ')[0]);
            const highestRes = urls[urls.length - 1];
            if (highestRes && !data.images.some(img => img.full === highestRes)) {
              data.images.push({
                thumbnail: highestRes.replace(/w\d+/, 'w480'),
                full: highestRes
              });
            }
          }
        });
      }

      // Extract seller information
      const sellerSection = document.querySelector('[data-testid="key-information"]');
      if (sellerSection) {
        // Seller name/company
        const sellerNameElement = sellerSection.querySelector('.sc-8j155h-6');
        data.sellerName = sellerNameElement ? sellerNameElement.textContent.trim() : null;

        // Seller location
        const locationElements = sellerSection.querySelectorAll('.sc-8j155h-2');
        if (locationElements.length > 0) {
          data.sellerLocation = Array.from(locationElements).map(el => el.textContent.trim()).join(', ');
        }
      }

      // Extract contact information
      const contactSection = document.querySelector('[data-testid="contact-seller"]');
      if (contactSection) {
        // Phone number
        const phoneLink = contactSection.querySelector('a[href^="tel:"]');
        if (phoneLink) {
          const href = phoneLink.getAttribute('href');
          data.phoneNumber = href.replace('tel:', '');
        }

        // Location and distance
        const locationElement = contactSection.querySelector('.sc-uz3tnf-4');
        data.contactLocation = locationElement ? locationElement.textContent.trim() : null;
      }

      // Extract year from registration if available
      if (data.registration) {
        const yearMatch = data.registration.match(/(\d{4})/);
        if (yearMatch) {
          data.year = yearMatch[1];
        }
      }

      return data;
    });

    // Add metadata
    details.carId = carId;
    details.url = carUrl;
    details.extractedAt = new Date().toISOString();

    return details;

  } catch (error) {
    console.error(`  Error extracting details for car ${carId}:`, error.message);
    return {
      carId,
      url: carUrl,
      error: error.message,
      extractedAt: new Date().toISOString()
    };
  }
}

/**
 * Extracts details for multiple cars
 * @param {Browser} browser - Puppeteer browser object
 * @param {Array} cars - Array of car objects with id and link
 * @returns {Promise<Array>} Array of detailed car information
 */
export async function extractDetailsForCars(browser, cars) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  const detailedCars = [];

  for (let i = 0; i < cars.length; i++) {
    const car = cars[i];
    console.log(`[${i + 1}/${cars.length}] Processing car ${car.id}...`);
    
    if (!car.link) {
      console.log(`  Skipping car ${car.id} - no link available`);
      detailedCars.push({
        ...car,
        error: 'No link available'
      });
      continue;
    }

    // Clean up the URL to remove query parameters for cleaner links
    const cleanUrl = car.link.split('?')[0];
    
    const details = await extractCarDetails(page, cleanUrl, car.id);
    
    // Merge the original car data with detailed information
    detailedCars.push({
      ...car,
      ...details,
      // Preserve original fields, but override with detailed data if available
      price: details.price || car.price,
      mileage: details.mileage || car.mileage,
      year: details.year || car.year,
      location: details.contactLocation || details.sellerLocation || car.location
    });

    // Add a small delay between requests to be respectful
    if (i < cars.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  await page.close();
  return detailedCars;
}


