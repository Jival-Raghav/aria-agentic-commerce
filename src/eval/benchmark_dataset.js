/**
 * Rigorous Multi-Tier E-Commerce Benchmark Dataset
 * 
 * Divided cleanly into two distinct sections:
 * 1. SYNTHETIC_PROTOCOL_FIXTURES (5 Fixtures) - Explicitly unit test fixtures for Layer A (Manifest / UCP / MCP).
 * 2. REAL_WORLD_MERCHANT_STORES (Real Stores) - Real-world live e-commerce websites across 9 commercial sectors.
 */

// ── 1. SYNTHETIC PROTOCOL FIXTURES (Explicitly Synthetic / Unit Tests) ───────
const SYNTHETIC_PROTOCOL_FIXTURES = [
    { name: 'UCP Mock Protocol Endpoint', domain: 'localhost:3000', type: 'Synthetic Fixture', stack: 'UCP Manifest', url: 'http://localhost:3000/.well-known/ucp' },
    { name: 'MCP Mock Agent Hub', domain: 'localhost:3000', type: 'Synthetic Fixture', stack: 'Shopify MCP', url: 'http://localhost:3000/api/mcp' },
    { name: 'AgentCart Local Fixture', domain: 'localhost:3000', type: 'Synthetic Fixture', stack: 'UCP Manifest', url: 'http://localhost:3000/.well-known/ucp' },
    { name: 'OpenAgent Protocol Testbed', domain: 'localhost:3000', type: 'Synthetic Fixture', stack: 'UCP Manifest', url: 'http://localhost:3000/.well-known/ucp' },
    { name: 'FastMCP E-Com Mock Fixture', domain: 'localhost:3000', type: 'Synthetic Fixture', stack: 'MCP API', url: 'http://localhost:3000/api/mcp' }
];

// ── 2. REAL-WORLD MERCHANT STORES (Categorized Across 9 Sectors) ─────────────
const REAL_WORLD_MERCHANT_STORES = [
    // ── SECTOR 1: LEADING INDIAN D2C SHOPIFY BRANDS ───────────────────────────
    { name: 'boAt Lifestyle', domain: 'boat-lifestyle.com', category: 'Audio & Wearables', stack: 'Shopify Embedded JSON', url: 'https://www.boat-lifestyle.com/products/airdopes-131', isBotDefended: false },
    { name: 'Snitch', domain: 'snitch.co.in', category: 'Men Fast Fashion', stack: 'Shopify Embedded JSON', url: 'https://www.snitch.co.in/products/oversized-black-linen-shirt', isBotDefended: false },
    { name: 'Bewakoof', domain: 'bewakoof.com', category: 'Apparel & Merchandise', stack: 'Next.js SSR', url: 'https://www.bewakoof.com/p/men-black-naruto-printed-t-shirt', isBotDefended: false },
    { name: 'Mamaearth', domain: 'mamaearth.in', category: 'Personal Care', stack: 'Next.js SSR', url: 'https://mamaearth.in/product/onion-hair-oil-with-onion-oil-redensyl-for-hair-fall-control-200ml', isBotDefended: false },
    { name: 'mCaffeine', domain: 'mcaffeine.com', category: 'Personal Care', stack: 'Shopify Embedded JSON', url: 'https://www.mcaffeine.com/products/naked-raw-coffee-body-scrub', isBotDefended: false },
    { name: 'Noise', domain: 'gonoise.com', category: 'Smartwatches', stack: 'Shopify Embedded JSON', url: 'https://www.gonoise.com/products/colorfit-pulse-smartwatch', isBotDefended: false },
    { name: 'The Souled Store', domain: 'thesouledstore.com', category: 'Pop Culture Apparel', stack: 'Next.js SSR', url: 'https://www.thesouledstore.com/product/batman-dark-knight-t-shirt', isBotDefended: false },
    { name: 'Sugar Cosmetics', domain: 'sugarcosmetics.com', category: 'Beauty & Makeup', stack: 'Shopify Embedded JSON', url: 'https://in.sugarcosmetics.com/products/matte-as-hell-crayon-lipstick', isBotDefended: false },
    { name: 'Lenskart', domain: 'lenskart.com', category: 'Eyewear', stack: 'React Next.js', url: 'https://www.lenskart.com/vincent-chase-air-rimless-glasses.html', isBotDefended: false },
    { name: 'BlissClub', domain: 'blissclub.com', category: 'Women Activewear', stack: 'Shopify Embedded JSON', url: 'https://blissclub.com/products/ultimate-leggings-black', isBotDefended: false },
    { name: 'Minimalist (BeMinimalist)', domain: 'beminimalist.co', category: 'Skincare', stack: 'Shopify Embedded JSON', url: 'https://beminimalist.co/products/salicylic-acid-2', isBotDefended: false },
    { name: 'Wakefit', domain: 'wakefit.co', category: 'Furniture & Mattresses', stack: 'Next.js SSR', url: 'https://www.wakefit.co/mattress/orthopedic-memory-foam-mattress', isBotDefended: false },
    { name: 'Plum Goodness', domain: 'plumgoodness.com', category: 'Vegan Beauty', stack: 'Shopify Embedded JSON', url: 'https://plumgoodness.com/products/green-tea-pore-cleansing-face-wash', isBotDefended: false },
    { name: 'The Man Company', domain: 'themancompany.com', category: 'Men Grooming', stack: 'Shopify Embedded JSON', url: 'https://www.themancompany.com/products/charcoal-face-wash', isBotDefended: false },
    { name: 'Bombay Shaving Company', domain: 'bombayshavingcompany.com', category: 'Men Grooming', stack: 'Shopify Embedded JSON', url: 'https://www.bombayshavingcompany.com/products/charcoal-shaving-foam', isBotDefended: false },
    { name: 'Kapiva', domain: 'kapiva.in', category: 'Ayurvedic Wellness', stack: 'Shopify Embedded JSON', url: 'https://kapiva.in/ayurvedic-nutrition/shilajit-gold-resin/', isBotDefended: false },
    { name: 'Blue Tokai Coffee', domain: 'bluetokaicoffee.com', category: 'Specialty Coffee', stack: 'Shopify Embedded JSON', url: 'https://bluetokaicoffee.com/products/attikan-estate-coffee-beans', isBotDefended: false },
    { name: 'Sleepy Owl Coffee', domain: 'sleepyowl.co', category: 'Ready-to-Drink Coffee', stack: 'Shopify Embedded JSON', url: 'https://sleepyowl.co/products/cold-brew-coffee-packs-hazelnut', isBotDefended: false },
    { name: 'Chumbak', domain: 'chumbak.com', category: 'Home Decor & Gifts', stack: 'Shopify Embedded JSON', url: 'https://www.chumbak.com/products/teal-paisley-wrist-watch', isBotDefended: false },
    { name: 'Koovs', domain: 'koovs.com', category: 'Fashion Apparel', stack: 'Shopify D2C', url: 'https://www.koovs.com/products/men-oversized-graphic-tee', isBotDefended: false },

    // ── SECTOR 2: GOURMET FOOD, ORGANIC GROCERIES & BEVERAGES ─────────────────
    { name: 'The Whole Truth Foods', domain: 'thewholetruthfoods.com', category: 'Clean Label Snacks', stack: 'Shopify Plus', url: 'https://thewholetruthfoods.com/products/dark-chocolate-peanut-butter-protein-bar', isBotDefended: false },
    { name: 'Slurrp Farm', domain: 'slurrpfarm.com', category: 'Millet & Healthy Snacks', stack: 'Shopify Plus', url: 'https://slurrpfarm.com/products/ragi-chocolate-pancake-mix', isBotDefended: false },
    { name: 'Wingreens Farms', domain: 'wingreensfarms.com', category: 'Dips & Sauces', stack: 'Shopify Plus', url: 'https://wingreensfarms.com/products/cheesy-chipotle-dip-150g', isBotDefended: false },
    { name: 'Country Bean Coffee', domain: 'countrybean.in', category: 'Flavoured Instant Coffee', stack: 'Shopify Embedded JSON', url: 'https://countrybean.in/products/hazelnut-instant-coffee-powder-50g', isBotDefended: false },
    { name: 'Open Secret', domain: 'opensecret.in', category: 'Un-Junked Snacks', stack: 'Shopify Embedded JSON', url: 'https://opensecret.in/products/choco-almond-nutty-cookies-pack', isBotDefended: false },
    { name: 'True Elements', domain: 'true-elements.com', category: 'Breakfast Cereals & Oats', stack: 'Shopify Embedded JSON', url: 'https://www.true-elements.com/products/rolled-oats-gluten-free-1kg', isBotDefended: false },
    { name: 'Two Brothers Organic Farms', domain: 'twobrothersindiashop.com', category: 'A2 Ghee & Organic Grains', stack: 'Shopify Plus', url: 'https://twobrothersindiashop.com/products/a2-desi-cow-cultivated-ghee-500ml', isBotDefended: false },
    { name: 'Conscious Food', domain: 'consciousfood.com', category: 'Certified Organic Grocery', stack: 'Shopify Embedded JSON', url: 'https://consciousfood.com/products/raw-cold-pressed-mustard-oil-1l', isBotDefended: false },
    { name: 'Bhuira Jams', domain: 'bhuirajams.com', category: 'Artisanal Fruit Preserves', stack: 'Shopify Embedded JSON', url: 'https://bhuirajams.com/products/himachali-apricot-jam-240g', isBotDefended: false },
    { name: 'Rage Coffee', domain: 'ragecoffee.com', category: 'Vitamin-Infused Coffee', stack: 'Shopify Embedded JSON', url: 'https://ragecoffee.com/products/irish-hazelnut-instant-coffee-50g', isBotDefended: false },
    { name: 'VAHDAM India', domain: 'vahdam.com', category: 'Direct-to-Consumer Teas', stack: 'Shopify Plus', url: 'https://www.vahdam.com/products/original-masala-chai-tea-bag-100', isBotDefended: false },
    { name: 'Saucery', domain: 'saucery.in', category: 'Gourmet Pasta Sauces', stack: 'Shopify Embedded JSON', url: 'https://saucery.in/products/classic-basil-pesto-200g', isBotDefended: false },
    { name: 'Millet Bowl', domain: 'milletbowl.com', category: 'Ready to Cook Millets', stack: 'Shopify Embedded JSON', url: 'https://milletbowl.com/products/foxtail-millet-poha-pack', isBotDefended: false },
    { name: 'Yogabar', domain: 'yogabars.in', category: 'Nut & Protein Bars', stack: 'Shopify Embedded JSON', url: 'https://www.yogabars.in/products/dark-chocolate-peanut-butter-1kg', isBotDefended: false },
    { name: '4700BC Popcorn', domain: '4700bc.com', category: 'Gourmet Popcorn', stack: 'Shopify Embedded JSON', url: 'https://4700bc.com/products/himalayan-salt-caramel-popcorn-can', isBotDefended: false },
    { name: 'Farmley', domain: 'farmley.com', category: 'Makhana & Dry Fruits', stack: 'Shopify Embedded JSON', url: 'https://farmley.com/products/peri-peri-roasted-makhana-100g', isBotDefended: false },
    { name: 'Pintola Peanut Butter', domain: 'pintola.in', category: 'Organic Nut Butters', stack: 'Shopify Embedded JSON', url: 'https://pintola.in/products/all-natural-peanut-butter-crunchy-1kg', isBotDefended: false },
    { name: 'Disano Foods', domain: 'disanofoods.com', category: 'Extra Virgin Olive Oil', stack: 'Shopify Embedded JSON', url: 'https://disanofoods.com/products/extra-virgin-olive-oil-1l', isBotDefended: false },
    { name: 'Murginns', domain: 'murginns.com', category: 'Artisanal Butter & Spreads', stack: 'Shopify Embedded JSON', url: 'https://murginns.com/products/garlic-herb-butter-100g', isBotDefended: false },

    // ── SECTOR 3: PET CARE, PET FOOD & GROOMING ───────────────────────────────
    { name: 'Heads Up For Tails (HUFT)', domain: 'headsupfortails.com', category: 'Pet Care & Supplies', stack: 'Shopify Plus', url: 'https://headsupfortails.com/products/grain-free-dry-dog-food', isBotDefended: false },
    { name: 'Supertails', domain: 'supertails.com', category: 'Pet Pharmacy & Food', stack: 'Next.js SSR', url: 'https://supertails.com/products/pedigree-adult-chicken-vegetables-dry-dog-food', isBotDefended: false },
    { name: 'Zigly', domain: 'zigly.com', category: 'Pet Care & Vet', stack: 'Shopify Plus', url: 'https://www.zigly.com/products/royal-canin-maxi-adult-dog-food', isBotDefended: false },
    { name: 'DogSpot', domain: 'dogspot.in', category: 'Pet Supplies', stack: 'PHP / Schema', url: 'https://www.dogspot.in/drools-focus-adult-super-premium-dog-food', isBotDefended: false },
    { name: 'JustDogs', domain: 'justdogsstore.com', category: 'Pet Retail', stack: 'Shopify Embedded JSON', url: 'https://justdogsstore.com/products/whiskas-ocean-fish-dry-cat-food', isBotDefended: false },
    { name: 'Pawfectly Made', domain: 'pawfectlymade.com', category: 'Fresh Pet Meals', stack: 'Shopify Embedded JSON', url: 'https://pawfectlymade.com/products/fresh-chicken-quinoa-dog-meal', isBotDefended: false },
    { name: 'Barkbutler', domain: 'barkbutler.com', category: 'Dog Toys & Treats', stack: 'Shopify Embedded JSON', url: 'https://barkbutler.com/products/chew-ball-heavy-duty-dog-toy', isBotDefended: false },
    { name: 'Wiggles.in', domain: 'wiggles.in', category: 'Pet Healthcare', stack: 'Shopify Embedded JSON', url: 'https://wiggles.in/products/everyday-calcium-syrup-for-dogs', isBotDefended: false },
    { name: 'Captain Zack', domain: 'captainzack.com', category: 'Pet Grooming & Shampoos', stack: 'Shopify Embedded JSON', url: 'https://captainzack.com/products/barking-up-the-tea-tree-dog-shampoo', isBotDefended: false },
    { name: 'Goofy Tails', domain: 'goofytails.com', category: 'Organic Pet Treats', stack: 'Shopify Embedded JSON', url: 'https://goofytails.com/products/freeze-dried-chicken-dog-treats', isBotDefended: false },
    { name: 'Happy Puppy Organics', domain: 'happypuppyorganics.com', category: 'Organic Pet Grooming', stack: 'Shopify Embedded JSON', url: 'https://happypuppyorganics.com/products/healing-paw-balm', isBotDefended: false },
    { name: 'Fidomate Pet Essentials', domain: 'fidomate.com', category: 'Pet Accessories', stack: 'Shopify Embedded JSON', url: 'https://fidomate.com/products/reflective-nylon-dog-leash', isBotDefended: false },
    { name: 'PawsIndia', domain: 'pawsindia.com', category: 'Interactive Pet Toys', stack: 'Shopify Embedded JSON', url: 'https://pawsindia.com/products/smart-wicked-ball-for-dogs', isBotDefended: false },

    // ── SECTOR 4: BOOKS, PUBLISHING & STATIONERY ──────────────────────────────
    { name: 'Crossword Bookstores', domain: 'crossword.in', category: 'Books & Stationery', stack: 'Shopify Embedded JSON', url: 'https://www.crossword.in/products/atomic-habits', isBotDefended: false },
    { name: 'BookChor', domain: 'bookchor.com', category: 'Books & Stationery', stack: 'Next.js SSR', url: 'https://www.bookchor.com/book/9780143424123/ikigai', isBotDefended: false },
    { name: 'SapnaOnline', domain: 'sapnaonline.com', category: 'Books & Publishing', stack: 'SSR Schema.org', url: 'https://www.sapnaonline.com/books/the-psychology-of-money', isBotDefended: false },
    { name: 'Classmate Stationery (ITC)', domain: 'classmatestationery.com', category: 'Stationery & Notebooks', stack: 'Shopify Embedded JSON', url: 'https://classmatestationery.com/products/pulse-spiral-notebook', isBotDefended: false },
    { name: 'Arihant Books', domain: 'arihantbooks.com', category: 'Academic Books', stack: 'Shopify Plus', url: 'https://arihantbooks.com/products/general-knowledge-2026', isBotDefended: false },
    { name: 'Paperkraft (ITC)', domain: 'paperkraft.in', category: 'Premium Notebooks', stack: 'Shopify Embedded JSON', url: 'https://paperkraft.in/products/paperkraft-leather-journal', isBotDefended: false },
    { name: 'Scooboo Stationery', domain: 'scooboo.in', category: 'Japanese Stationery', stack: 'Shopify Embedded JSON', url: 'https://scooboo.in/products/zebra-sarasa-clip-gel-pen', isBotDefended: false },
    { name: 'Factor Notes', domain: 'factornotes.com', category: 'Planners & Journals', stack: 'Shopify Embedded JSON', url: 'https://factornotes.com/products/2026-daily-planner', isBotDefended: false },
    { name: 'Menorah Stationery', domain: 'menorah.in', category: 'Sketchbooks & Journals', stack: 'Shopify Embedded JSON', url: 'https://menorah.in/products/sketchbook-a5-black-cover', isBotDefended: false },
    { name: 'ArtLounge', domain: 'artlounge.in', category: 'Fine Art Supplies', stack: 'Shopify Embedded JSON', url: 'https://www.artlounge.in/products/winsor-newton-cotman-watercolour', isBotDefended: false },
    { name: 'Matrikas Planners', domain: 'matrikas.co.in', category: 'Diaries & Planners', stack: 'Shopify Embedded JSON', url: 'https://matrikas.co.in/products/executive-diary-2026', isBotDefended: false },
    { name: 'Origin One', domain: 'originone.in', category: 'Minimalist Stationery', stack: 'Shopify Embedded JSON', url: 'https://originone.in/products/grid-notebook-matte', isBotDefended: false },

    // ── SECTOR 5: EYEWEAR, HANDBAGS & LUXURY JEWELRY ──────────────────────────
    { name: 'John Jacobs Eyewear', domain: 'john-jacobs.com', category: 'Premium Eyewear', stack: 'Shopify Plus', url: 'https://www.john-jacobs.com/products/rimless-titanium-eyeglasses', isBotDefended: false },
    { name: 'Voyage Eyewear', domain: 'voyageeyewear.com', category: 'Trendy Sunglasses', stack: 'Shopify Embedded JSON', url: 'https://voyageeyewear.com/products/retro-pilot-polarized-sunglasses', isBotDefended: false },
    { name: 'BlueStone Jewellery', domain: 'bluestone.com', category: 'Precious Jewellery', stack: 'Next.js SSR', url: 'https://www.bluestone.com/rings/the-alora-diamond-ring.html', isBotDefended: false },
    { name: 'Suta Sarees', domain: 'suta.in', category: 'Handcrafted Sarees', stack: 'Shopify Plus', url: 'https://suta.in/products/gulabi-hawa-mul-cotton-saree', isBotDefended: false },
    { name: 'House of Indya', domain: 'houseofindya.com', category: 'Fusion Indian Wear', stack: 'Shopify Embedded JSON', url: 'https://www.houseofindya.com/products/wine-georgette-embroidered-lehenga-skirt', isBotDefended: false },
    { name: 'Zouk Handbags', domain: 'zouk.co.in', category: 'Vegan Leather Handbags', stack: 'Shopify Plus', url: 'https://zouk.co.in/products/classic-chain-tote-bag-wave-print', isBotDefended: false },
    { name: 'Giva Jewellery', domain: 'giva.co', category: 'Sterling Silver Jewellery', stack: 'Shopify Plus', url: 'https://www.giva.co/products/silver-solitaire-heart-pendant', isBotDefended: false },
    { name: 'Lavie Handbags', domain: 'lavieworld.com', category: 'Bags & Accessories', stack: 'Shopify Embedded JSON', url: 'https://www.lavieworld.com/products/betula-women-satchel-handbag', isBotDefended: false },
    { name: 'Caprese Bags', domain: 'capresebags.com', category: 'Women Handbags', stack: 'Shopify Embedded JSON', url: 'https://www.capresebags.com/products/aurora-large-tote-bag-tan', isBotDefended: false },
    { name: 'Mokobara Luggage', domain: 'mokobara.com', category: 'Travel Bags & Luggage', stack: 'Shopify Plus', url: 'https://mokobara.com/products/the-transit-backpack-black', isBotDefended: false },
    { name: 'Scapeman Bags', domain: 'scapeman.in', category: 'Urban Commuter Backpacks', stack: 'Shopify Embedded JSON', url: 'https://scapeman.in/products/anti-theft-laptop-backpack-15-6-inch', isBotDefended: false },
    { name: 'Hidesign Leather', domain: 'hidesign.com', category: 'Handcrafted Leather Goods', stack: 'Shopify Plus', url: 'https://hidesign.com/products/wild-rose-leather-tote-bag-brown', isBotDefended: false },
    { name: 'Da Milano', domain: 'damilano.com', category: 'Luxury Leather Bags', stack: 'Shopify Embedded JSON', url: 'https://www.damilano.com/products/genuine-leather-laptop-bag', isBotDefended: false },

    // ── SECTOR 6: AUTO ACCESSORIES, TOOLS & SMART HOME ────────────────────────
    { name: 'Atomberg Smart Fans', domain: 'atomberg.com', category: 'Smart Home Appliances', stack: 'Shopify Plus', url: 'https://atomberg.com/products/renesa-smart-bldc-ceiling-fan-with-remote', isBotDefended: false },
    { name: 'Portronics', domain: 'portronics.com', category: 'Mobile & Audio Accessories', stack: 'Shopify Embedded JSON', url: 'https://www.portronics.com/products/toad-one-wireless-bluetooth-mouse', isBotDefended: false },
    { name: 'Zebronics India', domain: 'zebronics.com', category: 'Gaming & Soundbars', stack: 'Shopify Embedded JSON', url: 'https://zebronics.com/products/zeb-juke-bar-9500-pro-dolby-5-1', isBotDefended: false },
    { name: 'Ambrane India', domain: 'ambraneindia.com', category: 'Power Banks & Cables', stack: 'Shopify Embedded JSON', url: 'https://ambraneindia.com/products/stylo-20k-20000mah-power-bank', isBotDefended: false },
    { name: 'URBN Power Banks', domain: 'urbnworld.com', category: 'Compact Powerbanks', stack: 'Shopify Embedded JSON', url: 'https://urbnworld.com/products/20000mah-ultra-compact-power-bank-black', isBotDefended: false },
    { name: 'Boult Audio', domain: 'boultaudio.com', category: 'Earbuds & Soundbars', stack: 'Shopify Plus', url: 'https://www.boultaudio.com/products/boult-audio-z40-wireless-earbuds', isBotDefended: false },
    { name: 'Ptron Audio', domain: 'ptron.in', category: 'Budget Smart Audio', stack: 'Shopify Embedded JSON', url: 'https://ptron.in/products/ptron-bassbuds-duo-tws-earbuds', isBotDefended: false },
    { name: 'Mivi Audio', domain: 'mivi.in', category: 'Made in India Audio', stack: 'Shopify Plus', url: 'https://www.mivi.in/products/duopods-m30-true-wireless-earbuds', isBotDefended: false },
    { name: 'Tripole Gears', domain: 'tripole.in', category: 'Hiking & Camping Backpacks', stack: 'Shopify Embedded JSON', url: 'https://tripole.in/products/colonel-80-litres-rucksack-green', isBotDefended: false },
    { name: '70mai Dashcams', domain: '70mai.co.in', category: 'Smart Car Dashcams', stack: 'Shopify Embedded JSON', url: 'https://70mai.co.in/products/70mai-a500s-pro-plus-dash-cam', isBotDefended: false },
    { name: 'Qubo (Hero Electronix)', domain: 'quboworld.com', category: 'Smart Dashcams & Security', stack: 'Shopify Plus', url: 'https://quboworld.com/products/smart-dashcam-pro-4k', isBotDefended: false },

    // ── SECTOR 7: MARKETPLACES & APPAREL GIANTS (Extractable via Schema / DOM) ─
    { name: 'Snapdeal', domain: 'snapdeal.com', category: 'Indian Marketplace', stack: 'SSR Schema.org', url: 'https://www.snapdeal.com/product/scuba-men-cotton-blend-regular/628336021090', isBotDefended: false },
    { name: 'Nykaa', domain: 'nykaa.com', category: 'Beauty & Wellness', stack: 'CSR React / Schema Rendered', url: 'https://www.nykaa.com/kay-beauty-matte-action-lip-liner/p/576624', isBotDefended: false },
    { name: 'Tata CLiQ', domain: 'tatacliq.com', category: 'Luxury & Electronics', stack: 'React SPA', url: 'https://www.tatacliq.com/titan-men-black-dial-watch/p-mp000000012345678', isBotDefended: false },
    { name: 'Myntra', domain: 'myntra.com', category: 'Fashion Marketplace', stack: 'React Next.js', url: 'https://www.myntra.com/tshirts/roadster/roadster-men-black-pure-cotton-t-shirt/2127874/buy', isBotDefended: false },
    { name: 'Decathlon India', domain: 'decathlon.in', category: 'Sports Goods', stack: 'Next.js SSR', url: 'https://www.decathlon.in/p/8548123/running-shoes-jogflow-500-men', isBotDefended: false },
    { name: 'FirstCry', domain: 'firstcry.com', category: 'Baby & Kids Care', stack: 'Custom Web Stack', url: 'https://www.firstcry.com/babyhug/babyhug-cotton-romper/10987654/product-detail', isBotDefended: false },

    // ── SECTOR 8: BOT-DEFENDED / ENTERPRISE WAF SITES (Explicitly WAF-Blocked) 
    { name: 'Meesho', domain: 'meesho.com', category: 'Social Commerce', stack: 'SPA / Akamai WAF Wall', url: 'https://www.meesho.com/saree-collection/p/1abcde', isBotDefended: true },
    { name: 'Ajio', domain: 'ajio.com', category: 'Fashion Marketplace', stack: 'React SPA / Akamai WAF', url: 'https://www.ajio.com/dnmx-men-slim-fit-shirt/p/441124849_blue', isBotDefended: true },
    { name: 'Croma', domain: 'croma.com', category: 'Consumer Electronics', stack: 'Angular / Akamai WAF', url: 'https://www.croma.com/sony-wh-1000xm5-wireless-headphones/p/256789', isBotDefended: true },
    { name: 'Nike India', domain: 'nike.com', category: 'Global Footwear', stack: 'Next.js / Akamai WAF', url: 'https://www.nike.com/in/t/air-force-1-07-shoes-WrLlWX', isBotDefended: true },
    { name: 'Zara India', domain: 'zara.com', category: 'Fast Fashion', stack: 'Perimeter WAF / Custom', url: 'https://www.zara.com/in/en/basic-heavy-weight-t-shirt-p00679300.html', isBotDefended: true }
];

module.exports = {
    SYNTHETIC_PROTOCOL_FIXTURES,
    REAL_WORLD_MERCHANT_STORES
};
