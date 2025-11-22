# AutoAutoTrader Bot

A Discord bot that monitors Autotrader for new car listings matching your criteria and posts them to Discord.

## Features

- 🔍 Scans Autotrader for cars matching specific criteria
- 🤖 Posts new listings to Discord
- 💾 Tracks posted cars in a local JSON file
- 🖥️ Headless browser support for Linux server deployment

## Search Criteria

- **Make**: Skoda
- **Model**: Fabia
- **Body Type**: Estate
- **Year Min**: 2010
- **Max Mileage**: 110,000
- **Postcode**: bl96jr
- **Min Engine Size**: 1.2L
- **Max Engine Size**: 1.6L
- **Exclude Written Off**: Yes

## Setup

1. Install dependencies:
```bash
npm install
```

2. Run the data extraction script:
```bash
npm run extract
```

## Project Structure

```
├── src/
│   ├── extract.js      # Autotrader data extraction
│   └── (future files)
├── package.json
└── README.md
```

## Next Steps

- [ ] Add Discord bot integration
- [ ] Add JSON file tracking for posted cars
- [ ] Add scheduling/automation
- [ ] Add error handling and retries

