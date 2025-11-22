#!/usr/bin/env python3
# -*- coding: utf-8 -*-

with open('src/extract.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Update import
content = content.replace(
    "import { searchConfig } from './search-config.js';",
    "import { getSearchConfig } from './search-config.js';"
)

# Update usage
content = content.replace(
    "    // Build the Autotrader search URL with parameters\n    // Based on actual Autotrader URL format from user's search\n    const searchParams = new URLSearchParams(searchConfig);",
    "    // Build the Autotrader search URL with parameters\n    // Based on actual Autotrader URL format from user's search\n    const searchConfig = getSearchConfig();\n    const searchParams = new URLSearchParams(searchConfig);"
)

with open('src/extract.js', 'w', encoding='utf-8') as f:
    f.write(content)

print('Updated extract.js to use getSearchConfig()')

