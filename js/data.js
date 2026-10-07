/**
 * data.js — Catalogue, journal, and mock back-office records for Maison Verdant.
 * Everything the storefront and admin render comes from here, so the site runs
 * with zero network calls beyond the photography itself.
 */

/** Build a sized Unsplash URL. */
export const img = (id, w = 1200) => `https://images.unsplash.com/photo-${id}?w=${w}&q=80&auto=format&fit=crop`;

/** Photography pools per category (Unsplash photo IDs). */
const POOL = {
  shirts: ['1596755094514-f87e34085b2c', '1602810318383-e386cc2a3ccf', '1598033129183-c4f50c736f10', '1603252109303-2751441dd157', '1620012253295-c15cc3e65df4', '1607345366928-199ea26cfe3e', '1618354691373-d851c5c3a990', '1621072156002-e2fccdc0b176'],
  shoes: ['1614252235316-8c857d38b5f4', '1533867617858-e7b97e060509', '1449505278894-297fdb3edbc1', '1560343090-f0409e92791a', '1543163521-1bf539c55dd2', '1491553895911-0055eca6402d', '1600185365483-26d7a4cc7519', '1525966222134-fcfa99b8ae77'],
  bags: ['1548036328-c9fa89d128fa', '1584917865442-de89df76afd3', '1590874103328-eac38a683ce7', '1553062407-98eeb64c6a62', '1566150905458-1bf1fc113f0d', '1591561954557-26941169b49e', '1594223274512-ad4803739b7c', '1622560480605-d83c853bc5c3'],
  watches: ['1523275335684-37898b6baf30', '1524592094714-0f0654e20314', '1522312346375-d1a52e2b99b3', '1587836374828-4dbafa94cf0e', '1547996160-81dfa63595aa', '1542496658-e33a6d0d50f6', '1533139502658-0198f920d8e8', '1508685096489-7aacd43bd3b1'],
  audio: ['1505740420928-5e560c06d30e', '1583394838336-acd977736f90', '1484704849700-f032a568e944', '1546435770-a3e426bf472b', '1618366712010-f4ae9c647dcb', '1524678606370-a47ad25cb82a', '1487215078519-e21cc028cb29'],
  eyewear: ['1572635196237-14b3f281503f', '1511499767150-a48a237f0083', '1577803645773-f96470509666', '1473496169904-658ba7c44d8a', '1508296695146-257a814070b4', '1509695507497-903c140c43b0', '1582142306909-195724d33ffc'],
  outerwear: ['1539533018447-63fcce2678e3', '1591047139829-d91aecb6caea', '1551028719-00167b16eac5', '1544022613-e87ca75a784a', '1520975954732-35dd22299614', '1548624313-0396c75e4b1a', '1604644401890-0bd678c83788', '1617137968427-85924c800a22'],
};

export const EDITORIAL = {
  hero: '1490481651871-ab68de25d43d',
  atelier: '1441986300917-64674bd600d8',
  story: '1445205170230-053b83016050',
  feature: '1469334031218-e382a71b716b',
  auth: '1515886657613-9f3515b0c78f',
  auth2: '1483985988355-763728e1935b',
  about: '1558769132-cb1aea458c5e',
  journal: ['1487222477894-8943e31ef7b2', '1509631179647-0177331693ae', '1507679799987-c73779587ccf', '1512436991641-6745cdb1723f', '1523381210434-271e8be1f52b', '1556905055-8f358a7a47b2', '1434389677669-e08b4cac3105', '1441986300917-64674bd600d8', '1490481651871-ab68de25d43d'],
  portraits: ['1494790108377-be9c29b29330', '1500648767791-00dcc994a43e', '1507003211169-0a1dd7228f2d', '1438761681033-6461ffad8d80', '1472099645785-5658abf4ff4e', '1544005313-94ddf0286df2', '1534528741775-53994a69daeb', '1506794778202-cad84cf45f1d'],
};

/** Colour vocabulary shared across the catalogue. */
const C = {
  ivory: { name: 'Ivory', hex: '#F3EEE3' }, white: { name: 'Chalk', hex: '#FAFAF7' }, sky: { name: 'Pale Sky', hex: '#C9D6E3' },
  navy: { name: 'Midnight', hex: '#1E2A3A' }, black: { name: 'Ink', hex: '#121212' }, tan: { name: 'Cognac', hex: '#9A5B2E' },
  chestnut: { name: 'Chestnut', hex: '#5C3A21' }, olive: { name: 'Olive', hex: '#5B5E3C' }, camel: { name: 'Camel', hex: '#B98E5E' },
  stone: { name: 'Stone', hex: '#C9C1B3' }, emerald: { name: 'Emerald', hex: '#0F4C3A' }, burgundy: { name: 'Bordeaux', hex: '#5E1F28' },
  silver: { name: 'Steel', hex: '#B9BCC0' }, gold: { name: 'Gold', hex: '#C7A15F' }, rose: { name: 'Rose Gold', hex: '#C99A86' },
  tortoise: { name: 'Tortoise', hex: '#6B4226' }, grey: { name: 'Flannel', hex: '#8B8A86' }, sand: { name: 'Sand', hex: '#E0D3BD' },
};

export const CATEGORIES = [
  { slug: 'shirts', name: 'Tailored Shirts', short: 'Shirts', eyebrow: 'The Shirting Room', image: POOL.shirts[0], description: 'Sea Island cotton, Irish linen and brushed flannel, cut by hand in small numbers and finished with mother-of-pearl.', subs: ['Poplin', 'Oxford', 'Linen', 'Flannel'] },
  { slug: 'shoes', name: 'Artisan Shoes', short: 'Shoes', eyebrow: 'The Last & The Welt', image: POOL.shoes[1], description: 'Goodyear-welted on English lasts from Northamptonshire calf, hand-burnished until the leather holds the light.', subs: ['Oxfords', 'Loafers', 'Boots', 'Sneakers'] },
  { slug: 'bags', name: 'Handcrafted Bags', short: 'Bags', eyebrow: 'Leather Goods', image: POOL.bags[0], description: 'Vegetable-tanned hides, saddle-stitched with waxed linen thread. Built to soften, darken and outlast the season.', subs: ['Totes', 'Crossbody', 'Travel', 'Small Leather'] },
  { slug: 'watches', name: 'Heritage Watches', short: 'Watches', eyebrow: 'Horology', image: POOL.watches[1], description: 'Mechanical movements, sapphire crystals and dials finished by hand in the Vallée de Joux tradition.', subs: ['Dress', 'Automatic', 'Chronograph', 'Straps'] },
  { slug: 'audio', name: 'Premium Audio', short: 'Audio', eyebrow: 'Sound Studio', image: POOL.audio[0], description: 'Lambskin, anodised aluminium and tuned beryllium drivers for listening that feels like a private recital.', subs: ['Over-Ear', 'In-Ear', 'Speakers'] },
  { slug: 'eyewear', name: 'Designer Eyewear', short: 'Eyewear', eyebrow: 'Optique', image: POOL.eyewear[0], description: 'Hand-polished Mazzucchelli acetate and titanium, fitted with mineral glass lenses ground in Italy.', subs: ['Acetate', 'Titanium', 'Aviator'] },
  { slug: 'outerwear', name: 'Refined Outerwear', short: 'Outerwear', eyebrow: 'The Coat Edit', image: POOL.outerwear[0], description: 'Double-faced cashmere, waxed cotton and supple shearling, tailored for weather and for years.', subs: ['Coats', 'Jackets', 'Knitwear'] },
];

/** Compact product factory keeps the catalogue readable. */
let seq = 0;
function p(o) {
  seq += 1;
  const pool = POOL[o.category];
  const k = o.i ?? seq;
  const images = [0, 1, 2, 3].map((n) => pool[(k + n * 3) % pool.length]);
  const slug = o.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return {
    id: `mv-${String(seq).padStart(3, '0')}`,
    slug,
    compareAt: null,
    sizes: [],
    tags: [],
    isNew: false,
    stock: 24,
    sold: 40 + ((seq * 37) % 260),
    createdAt: new Date(Date.UTC(2026, 8, 28) - seq * 86400000 * 3).toISOString(),
    ...o,
    images,
    sku: `MV-${o.category.slice(0, 3).toUpperCase()}-${String(1000 + seq * 7)}`,
    subcategory: o.sub,
  };
}

export const PRODUCTS = [
  // ---- Tailored shirts --------------------------------------------------
  p({ name: 'Sea Island Poplin Shirt', brand: 'Wexford Tailors', category: 'shirts', sub: 'Poplin', price: 285, rating: 4.8, reviews: 126, colors: [C.white, C.sky, C.ivory], sizes: ['XS', 'S', 'M', 'L', 'XL'], tags: ['cotton', 'essential', 'office'], isNew: true, stock: 32,
    description: 'Woven from the rarest long-staple cotton grown on the islands of the Caribbean, this poplin has the hand of silk and the resilience of canvas. A soft semi-cutaway collar and mother-of-pearl buttons sewn with a lily-pad shank complete a shirt made for decades of wear.',
    specs: { Composition: '100% Sea Island cotton, 140/2', Collar: 'Semi-cutaway, unfused', Buttons: 'Australian mother-of-pearl', Origin: 'Made in Portugal' } }),
  p({ name: 'Washed Oxford Button-Down', brand: 'Wexford Tailors', category: 'shirts', sub: 'Oxford', price: 195, rating: 4.7, reviews: 214, colors: [C.sky, C.white, C.stone], sizes: ['S', 'M', 'L', 'XL', 'XXL'], tags: ['cotton', 'weekend'], stock: 48,
    description: 'A heavier Oxford cloth garment-washed until it drapes like a favourite from years past. The unlined roll of its button-down collar is the quiet signature of an American classic, re-cut here with a softer shoulder.',
    specs: { Composition: '100% cotton Oxford, 2-ply', Fit: 'Relaxed through the body', Finish: 'Garment washed', Origin: 'Made in Italy' } }),
  p({ name: 'Irish Linen Camp Shirt', brand: 'Belmont Atelier', category: 'shirts', sub: 'Linen', price: 240, compareAt: 320, rating: 4.6, reviews: 88, colors: [C.sand, C.olive, C.white], sizes: ['S', 'M', 'L', 'XL'], tags: ['linen', 'summer', 'resort'], stock: 9,
    description: 'Spun and woven in County Down from Belgian flax, this linen breathes like morning air and creases with character. The open camp collar and straight hem are made to be worn untucked on long, unhurried afternoons.',
    specs: { Composition: '100% Irish linen, 190 g', Collar: 'Open camp', Hem: 'Straight with side vents', Origin: 'Made in Ireland' } }),
  p({ name: 'Brushed Flannel Overshirt', brand: 'Belmont Atelier', category: 'shirts', sub: 'Flannel', price: 265, rating: 4.9, reviews: 64, colors: [C.grey, C.chestnut, C.olive], sizes: ['S', 'M', 'L', 'XL'], tags: ['wool', 'autumn', 'layering'], isNew: true, stock: 18,
    description: 'Merino and cashmere blended then brushed on teasels for a surface as soft as fog. Worn as a shirt or thrown on as a light jacket, it has two bellowed chest pockets and horn buttons that warm to the touch.',
    specs: { Composition: '85% merino wool, 15% cashmere', Buttons: 'Genuine horn', Pockets: 'Two bellowed chest', Origin: 'Made in Scotland' } }),
  p({ name: 'Twill Evening Shirt', brand: 'Wexford Tailors', category: 'shirts', sub: 'Poplin', price: 310, rating: 4.8, reviews: 41, colors: [C.white, C.black], sizes: ['XS', 'S', 'M', 'L'], tags: ['formal', 'evening'], stock: 14,
    description: 'A fine herringbone twill with a quiet lustre that catches candlelight. The concealed placket and double French cuffs make it the natural companion to a dinner jacket or a perfectly pressed navy suit.',
    specs: { Composition: '100% Egyptian Giza cotton', Placket: 'Concealed fly front', Cuffs: 'Double French', Origin: 'Made in Italy' } }),
  p({ name: 'Silk Blend Band Collar Shirt', brand: 'Calder Row', category: 'shirts', sub: 'Linen', price: 345, compareAt: 420, rating: 4.5, reviews: 37, colors: [C.ivory, C.emerald, C.navy], sizes: ['S', 'M', 'L', 'XL'], tags: ['silk', 'evening', 'resort'], stock: 6,
    description: 'Mulberry silk woven with linen for a fabric that moves like water yet holds its shape. The band collar gives it an architectural calm, best worn buttoned to the throat or loose at a summer supper.',
    specs: { Composition: '55% silk, 45% linen', Collar: 'Band', Buttons: 'Corozo nut', Origin: 'Made in Japan' } }),

  // ---- Artisan shoes ----------------------------------------------------
  p({ name: 'Harrow Whole-Cut Oxford', brand: 'Ashgrove Leather', category: 'shoes', sub: 'Oxfords', price: 790, rating: 4.9, reviews: 152, colors: [C.black, C.chestnut], sizes: ['39', '40', '41', '42', '43', '44', '45'], tags: ['leather', 'formal', 'welted'], stock: 12,
    description: 'Cut from a single, flawless piece of French box calf with only one seam at the heel. Goodyear-welted on our slim 8204 last and hand-burnished over three days until the toe glows like old mahogany.',
    specs: { Upper: 'French box calf, single piece', Construction: 'Goodyear welted', Sole: 'Oak-bark tanned leather', Origin: 'Made in Northampton' } }),
  p({ name: 'Suede Penny Loafer', brand: 'Ashgrove Leather', category: 'shoes', sub: 'Loafers', price: 620, rating: 4.7, reviews: 98, colors: [C.tan, C.navy, C.olive], sizes: ['39', '40', '41', '42', '43', '44'], tags: ['suede', 'weekend'], isNew: true, stock: 20,
    description: 'Softly structured in Charles F. Stead reverse suede that looks better with every scuff. A hand-sewn moccasin apron and flexible leather sole make it as comfortable on cobblestones as it is at a long lunch.',
    specs: { Upper: 'Charles F. Stead suede', Construction: 'Blake stitched', Sole: 'Leather with rubber insert', Origin: 'Made in Spain' } }),
  p({ name: 'Chelsea Boot in Cordovan', brand: 'Ashgrove Leather', category: 'shoes', sub: 'Boots', price: 1180, rating: 5.0, reviews: 44, colors: [C.burgundy, C.black], sizes: ['40', '41', '42', '43', '44', '45'], tags: ['leather', 'winter', 'welted'], stock: 5,
    description: 'Shell cordovan from the Horween tannery in Chicago, the most coveted leather in shoemaking, rolled rather than creased with wear. Elastic gussets in deep burgundy and a storm welt keep the silhouette sharp in the worst weather.',
    specs: { Upper: 'Horween shell cordovan', Construction: 'Goodyear welted, storm welt', Sole: 'Dainite studded rubber', Origin: 'Made in Northampton' } }),
  p({ name: 'Court Leather Sneaker', brand: 'Calder Row', category: 'shoes', sub: 'Sneakers', price: 385, rating: 4.6, reviews: 312, colors: [C.white, C.black, C.stone], sizes: ['38', '39', '40', '41', '42', '43', '44', '45'], tags: ['leather', 'essential', 'weekend'], stock: 64,
    description: 'A minimal court silhouette made from full-grain Italian nappa and stitched to a Margom cup sole. No logos, no noise, simply a shoe that goes with everything you own.',
    specs: { Upper: 'Full-grain nappa', Lining: 'Calf leather', Sole: 'Margom natural rubber', Origin: 'Made in Italy' } }),
  p({ name: 'Double Monk Strap', brand: 'Ashgrove Leather', category: 'shoes', sub: 'Oxfords', price: 740, compareAt: 890, rating: 4.8, reviews: 67, colors: [C.chestnut, C.black], sizes: ['40', '41', '42', '43', '44'], tags: ['leather', 'formal'], stock: 8,
    description: 'Two antiqued brass buckles on a hand-painted chestnut calf, the confident alternative to a lace-up. The chiselled toe and closed channel sole bring an evening polish to flannel trousers.',
    specs: { Upper: 'Museum calf, hand-painted', Hardware: 'Antiqued solid brass', Construction: 'Goodyear welted', Origin: 'Made in Northampton' } }),
  p({ name: 'Nubuck Desert Boot', brand: 'Calder Row', category: 'shoes', sub: 'Boots', price: 420, rating: 4.5, reviews: 129, colors: [C.sand, C.chestnut], sizes: ['39', '40', '41', '42', '43', '44', '45'], tags: ['suede', 'weekend', 'autumn'], stock: 27,
    description: 'Two eyelets, a natural crepe sole and a nubuck upper that feels like velvet under the thumb. It is the boot of a slow Sunday walk, designed to be worn in rather than looked after.',
    specs: { Upper: 'Oiled nubuck', Sole: 'Natural plantation crepe', Lining: 'Unlined for flexibility', Origin: 'Made in Portugal' } }),

  // ---- Handcrafted bags ------------------------------------------------
  p({ name: 'Aldwych Structured Tote', brand: 'Maison Verdant', category: 'bags', sub: 'Totes', price: 1450, rating: 4.9, reviews: 83, colors: [C.tan, C.black, C.emerald], sizes: [], tags: ['leather', 'signature', 'office'], isNew: true, stock: 10,
    description: 'Our signature tote, cut from vegetable-tanned bridle leather that deepens to honey with the years. Its gently structured body holds a laptop and a day of small ceremonies, finished with hand-painted edges in forest green.',
    specs: { Leather: 'Italian vegetable-tanned bridle', Dimensions: '38 x 30 x 14 cm', Hardware: 'Palladium-plated brass', Origin: 'Made in Florence' } }),
  p({ name: 'Saddle Crossbody', brand: 'Harrow & Finch', category: 'bags', sub: 'Crossbody', price: 890, compareAt: 1090, rating: 4.7, reviews: 56, colors: [C.chestnut, C.camel, C.burgundy], sizes: [], tags: ['leather', 'weekend'], stock: 7,
    description: 'A half-moon silhouette drawn from equestrian tack, saddle-stitched by a single artisan with waxed linen. The adjustable strap sits at the hip, leaving the hands free for the rest of the afternoon.',
    specs: { Leather: 'Full-grain calf', Stitch: 'Hand saddle stitch', Dimensions: '24 x 18 x 7 cm', Origin: 'Made in England' } }),
  p({ name: 'Weekender in Waxed Canvas', brand: 'Harrow & Finch', category: 'bags', sub: 'Travel', price: 1120, rating: 4.8, reviews: 91, colors: [C.olive, C.navy, C.tan], sizes: [], tags: ['travel', 'canvas', 'leather'], stock: 15,
    description: 'Scottish waxed cotton paired with English bridle leather, sized precisely for cabin overhead bins and slow weekends away. A lined shoe compartment and solid brass zips make the long journey feel like the destination.',
    specs: { Body: 'Halley Stevensons waxed cotton', Trim: 'English bridle leather', Capacity: '42 litres', Origin: 'Made in England' } }),
  p({ name: 'Bellows Briefcase', brand: 'Maison Verdant', category: 'bags', sub: 'Travel', price: 1690, rating: 4.9, reviews: 38, colors: [C.black, C.chestnut], sizes: [], tags: ['leather', 'office', 'signature'], stock: 4,
    description: 'Three expanding gussets in Box calf, a lock worked by hand and a handle wrapped around a rope core for balance. It is a briefcase for people who still write letters.',
    specs: { Leather: 'Box calf, suede-lined', Dimensions: '40 x 29 x 12 cm', Lock: 'Solid brass keyed', Origin: 'Made in Florence' } }),
  p({ name: 'Card Holder in Cordovan', brand: 'Harrow & Finch', category: 'bags', sub: 'Small Leather', price: 210, rating: 4.8, reviews: 244, colors: [C.burgundy, C.black, C.tan], sizes: [], tags: ['leather', 'gift', 'essential'], stock: 58,
    description: 'Four card slots and a central pocket in shell cordovan, the leather that burnishes rather than wears. Edges are bevelled, dyed and polished eleven times for a finish that feels like lacquer.',
    specs: { Leather: 'Horween shell cordovan', Capacity: 'Four cards plus notes', Edges: 'Hand-bevelled and burnished', Origin: 'Made in England' } }),
  p({ name: 'Market Bucket Bag', brand: 'Belmont Atelier', category: 'bags', sub: 'Totes', price: 760, rating: 4.6, reviews: 49, colors: [C.sand, C.camel, C.black], sizes: [], tags: ['leather', 'summer'], stock: 13,
    description: 'Unlined, supple lambskin gathered with a leather drawcord, designed for markets and seaside towns. It collapses flat into a suitcase and returns to shape the moment it is filled.',
    specs: { Leather: 'Lambskin nappa, unlined', Dimensions: '28 x 32 x 18 cm', Closure: 'Drawcord', Origin: 'Made in Spain' } }),

  // ---- Heritage watches ------------------------------------------------
  p({ name: 'Oriel Classique 38', brand: 'Oriel Horology', category: 'watches', sub: 'Dress', price: 4850, rating: 4.9, reviews: 72, colors: [C.silver, C.gold], sizes: [], tags: ['automatic', 'signature', 'formal'], stock: 6,
    description: 'A 38 mm case no thicker than two stacked coins, holding a hand-wound calibre with 60 hours of reserve. The grand feu enamel dial is fired eight times until its white takes on the depth of porcelain.',
    specs: { Case: '38 mm, 316L steel, 7.9 mm', Movement: 'Calibre OR-21, manual wind', Dial: 'Grand feu enamel', 'Water resistance': '30 m' } }),
  p({ name: 'Meridian Automatic', brand: 'Oriel Horology', category: 'watches', sub: 'Automatic', price: 3200, compareAt: 3650, rating: 4.8, reviews: 115, colors: [C.silver, C.navy], sizes: [], tags: ['automatic', 'essential'], isNew: true, stock: 11,
    description: 'An everyday automatic with a sunray midnight dial and faceted applied indices that catch the light at every angle. The display back reveals a rotor engraved with the Meridian line that runs through Greenwich.',
    specs: { Case: '40 mm, brushed steel', Movement: 'Calibre OR-9, automatic, 42 h', Crystal: 'Sapphire, anti-reflective', 'Water resistance': '100 m' } }),
  p({ name: 'Regatta Chronograph', brand: 'Oriel Horology', category: 'watches', sub: 'Chronograph', price: 6900, rating: 4.9, reviews: 29, colors: [C.silver, C.black], sizes: [], tags: ['chronograph', 'automatic'], stock: 3,
    description: 'A column-wheel chronograph inspired by the stopwatches of 1950s yacht racing. Pump pushers, a tachymeter bezel in black ceramic, and a silvered dial with azurage counters.',
    specs: { Case: '41 mm, polished steel', Movement: 'Column-wheel chronograph, 58 h', Bezel: 'Ceramic tachymeter', 'Water resistance': '100 m' } }),
  p({ name: 'Rose Gold Moonphase', brand: 'Oriel Horology', category: 'watches', sub: 'Dress', price: 12400, rating: 5.0, reviews: 14, colors: [C.rose], sizes: [], tags: ['gold', 'complication', 'formal'], stock: 2,
    description: 'An 18k rose gold case framing a moon disc of aventurine glass scattered with stars. The phase is accurate to one day in 122 years, so it will outlast the person who first winds it.',
    specs: { Case: '39 mm, 18k rose gold', Movement: 'Automatic moonphase, 72 h', Dial: 'Aventurine glass', Strap: 'Alligator, pin buckle' } }),
  p({ name: 'Field Watch in Titanium', brand: 'Norland', category: 'watches', sub: 'Automatic', price: 1450, rating: 4.6, reviews: 184, colors: [C.silver, C.olive], sizes: [], tags: ['titanium', 'weekend', 'essential'], stock: 30,
    description: 'Grade 5 titanium makes this field watch feel almost weightless on the wrist. A matte olive dial with lume-filled Arabic numerals reads instantly at dusk, on the trail or across a dinner table.',
    specs: { Case: '38 mm, grade 5 titanium', Movement: 'Swiss automatic, 38 h', Lume: 'Super-LumiNova BGW9', 'Water resistance': '200 m' } }),
  p({ name: 'Shell Cordovan Watch Strap', brand: 'Harrow & Finch', category: 'watches', sub: 'Straps', price: 180, rating: 4.7, reviews: 96, colors: [C.burgundy, C.chestnut, C.black], sizes: ['18 mm', '19 mm', '20 mm', '21 mm'], tags: ['leather', 'gift'], stock: 44,
    description: 'Hand-rolled edges and a quick-release spring bar let you change the character of a watch in seconds. Shell cordovan softens to the wrist within a week and never cracks.',
    specs: { Leather: 'Horween shell cordovan', Lining: 'Calf leather', Buckle: 'Brushed steel', Origin: 'Made in England' } }),

  // ---- Premium audio ---------------------------------------------------
  p({ name: 'Sable One Over-Ear Headphones', brand: 'Sable Audio', category: 'audio', sub: 'Over-Ear', price: 890, rating: 4.8, reviews: 402, colors: [C.black, C.sand, C.emerald], sizes: [], tags: ['wireless', 'noise-cancelling', 'signature'], isNew: true, stock: 26,
    description: 'Forty-millimetre beryllium drivers tuned by a concert-hall acoustician, cushioned in memory foam wrapped with lambskin. Adaptive noise cancelling retreats gracefully when you want to hear the world again.',
    specs: { Drivers: '40 mm beryllium-coated', Battery: '38 hours with ANC', Connectivity: 'Bluetooth 5.3, LDAC, USB-C', Weight: '278 g' } }),
  p({ name: 'Sable Studio Reference', brand: 'Sable Audio', category: 'audio', sub: 'Over-Ear', price: 1290, compareAt: 1490, rating: 4.9, reviews: 118, colors: [C.black, C.tan], sizes: [], tags: ['wired', 'studio'], stock: 8,
    description: 'An open-back reference headphone with hand-matched planar drivers and a walnut yoke. It reveals the breath before the note and the room around the orchestra.',
    specs: { Drivers: 'Planar magnetic, matched pairs', Impedance: '32 ohms', Cable: 'Braided OCC copper', Weight: '340 g' } }),
  p({ name: 'Sable Pods Ceramic', brand: 'Sable Audio', category: 'audio', sub: 'In-Ear', price: 420, rating: 4.6, reviews: 356, colors: [C.white, C.black], sizes: [], tags: ['wireless', 'essential'], stock: 52,
    description: 'True wireless earphones shelled in fired zirconia ceramic, cool to the touch and nearly impossible to scratch. They arrive in a machined aluminium case that closes with a whisper-soft magnetic click.',
    specs: { Drivers: '10 mm graphene', Battery: '8 h plus 24 h in case', Connectivity: 'Bluetooth 5.3, multipoint', 'Water resistance': 'IPX4' } }),
  p({ name: 'Aural Bookshelf Speaker Pair', brand: 'Sable Audio', category: 'audio', sub: 'Speakers', price: 2400, rating: 4.8, reviews: 42, colors: [C.tan, C.black], sizes: [], tags: ['home', 'wireless'], stock: 5,
    description: 'Solid American walnut cabinets hand-finished with oil, housing a silk dome tweeter and a woven fibreglass woofer. They fill a room with warmth rather than volume.',
    specs: { Cabinet: 'Solid walnut, oiled', Drivers: '25 mm silk dome, 130 mm woofer', Inputs: 'Wi-Fi, Bluetooth, phono, optical', Power: '2 x 80 W' } }),
  p({ name: 'Voyager Travel Headphones', brand: 'Norland', category: 'audio', sub: 'Over-Ear', price: 560, rating: 4.5, reviews: 211, colors: [C.stone, C.navy], sizes: [], tags: ['wireless', 'travel', 'noise-cancelling'], stock: 19,
    description: 'Folds flat into a felt-lined case no larger than a paperback, built for long-haul flights. The pressure-relieving cushions are tested on twelve-hour journeys before they ever leave the workshop.',
    specs: { Drivers: '38 mm bio-cellulose', Battery: '45 hours', Weight: '232 g', Case: 'Felt-lined, magnetic' } }),

  // ---- Designer eyewear ------------------------------------------------
  p({ name: 'Lune No. 3 Acetate', brand: 'Lune Optique', category: 'eyewear', sub: 'Acetate', price: 420, rating: 4.7, reviews: 133, colors: [C.tortoise, C.black, C.sand], sizes: [], tags: ['acetate', 'essential', 'summer'], isNew: true, stock: 22,
    description: 'A softened keyhole bridge and gently upswept brow cut from Mazzucchelli acetate, polished in tumbling barrels for three days. Mineral glass lenses give colour an almost painterly clarity.',
    specs: { Frame: 'Mazzucchelli acetate', Lens: 'Mineral glass, UV400', Hinges: 'Seven-barrel', Origin: 'Made in Italy' } }),
  p({ name: 'Riviera Titanium Aviator', brand: 'Lune Optique', category: 'eyewear', sub: 'Aviator', price: 540, compareAt: 620, rating: 4.8, reviews: 78, colors: [C.gold, C.silver], sizes: [], tags: ['titanium', 'summer'], stock: 12,
    description: 'Japanese beta-titanium so light the frame nearly disappears, with a double bridge gently bevelled by hand. Gradient lenses soften harsh Mediterranean light into something closer to dusk.',
    specs: { Frame: 'Beta titanium, IP-plated', Lens: 'Gradient mineral, polarised', Weight: '19 g', Origin: 'Made in Japan' } }),
  p({ name: 'Marais Round Frame', brand: 'Lune Optique', category: 'eyewear', sub: 'Acetate', price: 380, rating: 4.6, reviews: 91, colors: [C.black, C.tortoise], sizes: [], tags: ['acetate', 'optical'], stock: 30,
    description: 'A perfect circle drawn from 1930s Parisian optics, softened with a keyhole bridge. Supplied with demo lenses so it may be glazed to your prescription or worn as sunglasses.',
    specs: { Frame: 'Hand-polished acetate', Lens: 'Prescription ready', Hinges: 'Five-barrel riveted', Origin: 'Made in France' } }),
  p({ name: 'Capri Cat-Eye', brand: 'Belmont Atelier', category: 'eyewear', sub: 'Acetate', price: 460, rating: 4.7, reviews: 65, colors: [C.burgundy, C.black, C.ivory], sizes: [], tags: ['acetate', 'summer', 'resort'], stock: 7,
    description: 'An exaggerated wing tempered by gentle curves, inspired by starlets on the island ferry in 1962. Deep bordeaux acetate glows amber when the sun passes through it.',
    specs: { Frame: 'Mazzucchelli acetate', Lens: 'Nylon, category 3', Hinges: 'Seven-barrel', Origin: 'Made in Italy' } }),
  p({ name: 'Nordic Rimless Titanium', brand: 'Norland', category: 'eyewear', sub: 'Titanium', price: 495, rating: 4.4, reviews: 38, colors: [C.silver, C.gold], sizes: [], tags: ['titanium', 'optical'], stock: 16,
    description: 'Three screwless components and nothing more: rimless lenses held by a whisper of titanium wire. Designed for those who want clarity without the sense of wearing anything at all.',
    specs: { Frame: 'Pure titanium, screwless', Lens: 'Prescription ready', Weight: '7 g', Origin: 'Made in Denmark' } }),

  // ---- Refined outerwear -----------------------------------------------
  p({ name: 'Double-Faced Cashmere Coat', brand: 'Maison Verdant', category: 'outerwear', sub: 'Coats', price: 2850, rating: 4.9, reviews: 61, colors: [C.camel, C.black, C.stone], sizes: ['XS', 'S', 'M', 'L', 'XL'], tags: ['cashmere', 'signature', 'winter'], isNew: true, stock: 9,
    description: 'Two layers of Mongolian cashmere hand-stitched together at the edge so the coat needs no lining at all. It falls from the shoulder like a blanket and weighs less than a sweater.',
    specs: { Composition: '100% Mongolian cashmere, double-faced', Construction: 'Hand-finished, unlined', Length: 'Below knee', Origin: 'Made in Italy' } }),
  p({ name: 'Waxed Cotton Field Jacket', brand: 'Harrow & Finch', category: 'outerwear', sub: 'Jackets', price: 690, compareAt: 820, rating: 4.7, reviews: 142, colors: [C.olive, C.navy], sizes: ['S', 'M', 'L', 'XL', 'XXL'], tags: ['waxed', 'autumn', 'weekend'], stock: 21,
    description: 'Scottish waxed cotton that shrugs off the weather and patinas with every walk. A corduroy collar, four bellows pockets and a tartan lining make it the jacket of long country Sundays.',
    specs: { Shell: 'Halley Stevensons waxed cotton', Lining: 'Wool tartan', Collar: 'Needlecord', Origin: 'Made in England' } }),
  p({ name: 'Shearling Aviator Jacket', brand: 'Calder Row', category: 'outerwear', sub: 'Jackets', price: 3400, rating: 4.9, reviews: 33, colors: [C.chestnut, C.black], sizes: ['S', 'M', 'L', 'XL'], tags: ['leather', 'winter'], stock: 4,
    description: 'Spanish merino shearling, nappa-finished on the outside and deep as a cloud within. Built to the proportions of 1940s flight jackets with a throat latch and belted hem.',
    specs: { Material: 'Spanish merino shearling', Closure: 'Riri zip, throat latch', Weight: 'Heavyweight', Origin: 'Made in Spain' } }),
  p({ name: 'Unstructured Linen Blazer', brand: 'Wexford Tailors', category: 'outerwear', sub: 'Jackets', price: 980, rating: 4.6, reviews: 57, colors: [C.sand, C.navy, C.olive], sizes: ['46', '48', '50', '52', '54'], tags: ['linen', 'summer', 'tailoring'], stock: 14,
    description: 'A blazer with no canvas, no padding and nothing to stop the breeze. The natural shoulder and patch pockets let it be worn as easily as a cardigan on warm evenings.',
    specs: { Composition: '100% Irish linen', Construction: 'Unlined, unstructured', Buttons: 'Horn', Origin: 'Made in Naples' } }),
  p({ name: 'Cable Knit Fisherman Sweater', brand: 'Belmont Atelier', category: 'outerwear', sub: 'Knitwear', price: 420, rating: 4.8, reviews: 176, colors: [C.ivory, C.navy, C.olive], sizes: ['S', 'M', 'L', 'XL'], tags: ['wool', 'autumn', 'essential'], stock: 36,
    description: 'Hand-framed on the Aran islands in undyed lambswool that still carries its natural lanolin. Each cable is said to tell of the sea, the harvest and the way home.',
    specs: { Composition: '100% undyed lambswool', Gauge: '5 gauge, hand-framed', Fit: 'Relaxed', Origin: 'Made in Ireland' } }),
  p({ name: 'Belted Trench Coat', brand: 'Maison Verdant', category: 'outerwear', sub: 'Coats', price: 1890, compareAt: 2250, rating: 4.8, reviews: 88, colors: [C.stone, C.navy], sizes: ['XS', 'S', 'M', 'L', 'XL'], tags: ['cotton', 'signature', 'autumn'], stock: 11,
    description: 'Tightly woven cotton gabardine, storm flap, epaulettes and a leather-covered buckle: the trench exactly as it should be. Lined in emerald silk twill so the coat is a small secret every time it opens.',
    specs: { Shell: 'Cotton gabardine, water repellent', Lining: 'Silk twill', Buttons: 'Horn, hand-sewn', Origin: 'Made in England' } }),
  p({ name: 'Merino Rollneck', brand: 'Norland', category: 'outerwear', sub: 'Knitwear', price: 295, rating: 4.7, reviews: 203, colors: [C.black, C.camel, C.grey, C.emerald], sizes: ['XS', 'S', 'M', 'L', 'XL'], tags: ['wool', 'essential', 'layering'], stock: 48,
    description: 'Extra-fine 16.5 micron merino knitted fully fashioned so it lies flat under a jacket. A deep, relaxed rollneck that sits softly rather than climbing to the chin.',
    specs: { Composition: '100% extra-fine merino', Gauge: '14 gauge, fully fashioned', Care: 'Hand wash cold', Origin: 'Made in Scotland' } }),
  p({ name: 'Quilted Cashmere Gilet', brand: 'Calder Row', category: 'outerwear', sub: 'Jackets', price: 740, rating: 4.5, reviews: 29, colors: [C.navy, C.olive, C.camel], sizes: ['S', 'M', 'L', 'XL'], tags: ['cashmere', 'layering', 'travel'], isNew: true, stock: 17,
    description: 'Diamond-quilted cashmere-silk shell filled with responsibly sourced down. The warmth of a coat and the freedom of a sweater, packing into its own pocket for travel.',
    specs: { Shell: '70% cashmere, 30% silk', Fill: 'RDS down, 750 fill power', Closure: 'Two-way zip', Origin: 'Made in Italy' } }),
];

/** Derived lookups ---------------------------------------------------- */
export const BRANDS = [...new Set(PRODUCTS.map((x) => x.brand))].sort();
export const COLORS = Object.values(C);
export const findProduct = (key) => PRODUCTS.find((x) => x.id === key || x.slug === key);
export const findCategory = (slug) => CATEGORIES.find((c) => c.slug === slug);

/** Customer reviews (PDP + admin moderation). */
const REVIEW_BANK = [
  { title: 'Quietly perfect', body: 'The quality is immediately obvious the moment you open the box. Everything about it has been considered, from the stitching to the way it feels in the hand. I have worn it nearly every day since it arrived.', rating: 5 },
  { title: 'Worth the wait', body: 'I hesitated at the price for weeks and I regret only that I waited. The finishing is better than pieces I own from far more famous houses, and the concierge team answered every question within the hour.', rating: 5 },
  { title: 'Beautiful, sizing runs slightly small', body: 'Exceptional materials and a refined shape. I would suggest going half a size up if you are between sizes. The exchange was effortless and the replacement arrived in two days.', rating: 4 },
  { title: 'An heirloom piece', body: 'This feels like something I will hand down. It has already started to develop a lovely character after a month of wear and it only looks better with time.', rating: 5 },
  { title: 'Lovely but understated', body: 'Exactly as described, although the colour is a touch softer in person than on screen. That turned out to be a good thing: it goes with everything.', rating: 4 },
  { title: 'The packaging alone', body: 'Wrapped in tissue, boxed in linen and sealed with wax. It felt like receiving a letter. The piece itself is immaculate.', rating: 5 },
  { title: 'Good, not transformative', body: 'Well made and comfortable. I expected a little more weight given the price, but the craftsmanship is undeniable and I am keeping it.', rating: 3 },
];
const NAMES = ['Eleanor Whitcombe', 'James Harrington', 'Sofia Marchetti', 'Oliver Bancroft', 'Amelia Laurent', 'Henry Ashdown', 'Charlotte Vale', 'Theodore Quinn', 'Isabelle Moreau', 'Sebastian Clarke', 'Margot Fairfax', 'Lucas Beaumont'];
export const REVIEWS = PRODUCTS.flatMap((prod, pi) => Array.from({ length: 4 }, (_, n) => {
  const r = REVIEW_BANK[(pi + n * 2) % REVIEW_BANK.length];
  return {
    id: `rv-${pi}-${n}`, productId: prod.id, author: NAMES[(pi + n * 5) % NAMES.length], avatar: EDITORIAL.portraits[(pi + n) % EDITORIAL.portraits.length],
    verified: n !== 3, date: new Date(Date.UTC(2026, 8, 20) - (pi * 3 + n * 11) * 86400000).toISOString(), helpful: (pi * 7 + n * 3) % 40,
    photos: n === 0 ? [prod.images[1], prod.images[2]] : [], status: n === 3 && pi % 3 === 0 ? 'pending' : 'approved', ...r,
  };
}));

export const QUESTIONS = [
  { q: 'Can this be monogrammed?', a: 'Yes. Our atelier offers blind or gilt-embossed initials on most leather goods and hand embroidery on shirting. Add a note at checkout and allow three additional working days.' },
  { q: 'How should I care for it between wears?', a: 'Rest it for a day between wears, store it in the linen dust bag provided, and keep it away from direct sunlight. Our concierge can arrange professional care at any time.' },
  { q: 'Is repair offered after purchase?', a: 'Every Maison Verdant piece is covered by our lifetime repair service. Resoling, restitching and re-edging are carried out by the artisans who made it.' },
];

export const TESTIMONIALS = [
  { quote: 'The coat arrived wrapped like a letter from someone who cared. Three winters on, it is the first thing guests ask about.', name: 'Clementine Ashford', place: 'London' },
  { quote: 'Maison Verdant feels less like a shop and more like a friend with extraordinary taste who happens to know every artisan in Europe.', name: 'Rafael Montoya', place: 'Madrid' },
  { quote: 'My concierge remembered my size, my wife\'s birthday and the name of our dog. That is not service. That is hospitality.', name: 'Hiroshi Tanabe', place: 'Kyoto' },
];

/** Journal articles. */
const BODY = (topic) => [
  { h: 'An unhurried beginning', p: [`Every piece in this story begins long before it reaches the atelier. ${topic} starts as a conversation between a maker and a material, one that can take a season or a decade to resolve.`, 'We visited workshops where the same families have practised the same craft for four generations. What they share is not nostalgia but patience: an insistence that some things simply cannot be hurried.'] },
  { h: 'The hand and the material', sub: 'Choosing what lasts', p: ['The best materials announce themselves quietly. A hide with a tight, even grain. A cloth that springs back after being crushed in the fist. A steel that takes a mirror polish without ever looking cold.', 'Our buyers reject far more than they approve. For every bolt of cloth that enters the collection, nine are returned with thanks.'], quote: 'You cannot fake time. The only way to make something that lasts is to spend the hours it needs.' },
  { h: 'Living with it', p: ['A well-made object changes with its owner. Leather darkens where the hand rests. Wool softens at the elbow. A watch gathers the tiny scratches of a life fully lived.'], list: ['Rest leather and wool for a day between wears.', 'Store in breathable linen, never plastic.', 'Repair early, and repair often.', 'Let patina happen; it is the record of your care.'] },
  { h: 'Why it matters', p: ['Buying less and buying better is not a trend. It is the oldest idea in dressing well, and the one we return to every season.'] },
];
export const POSTS = [
  { slug: 'the-art-of-the-goodyear-welt', title: 'The Art of the Goodyear Welt', category: 'Craft', author: 'Henry Ashdown', role: 'Head of Leather Goods', date: '2026-09-18', read: 8, image: EDITORIAL.journal[2], excerpt: 'Inside a Northamptonshire workshop where a single pair of shoes passes through two hundred hands and eight weeks of patience.', tags: ['Shoes', 'Craft', 'Leather'] },
  { slug: 'a-quiet-wardrobe', title: 'A Quiet Wardrobe: Twelve Pieces for a Lifetime', category: 'Style', author: 'Charlotte Vale', role: 'Creative Director', date: '2026-09-09', read: 6, image: EDITORIAL.journal[0], excerpt: 'Our creative director on the pieces she would keep if she could keep only a dozen, and why restraint is the ultimate luxury.', tags: ['Style', 'Essentials'] },
  { slug: 'grand-feu-enamel', title: 'Fire and Patience: The Grand Feu Enamel Dial', category: 'Horology', author: 'Theodore Quinn', role: 'Watch Curator', date: '2026-08-28', read: 10, image: EDITORIAL.journal[3], excerpt: 'Why the most beautiful white in watchmaking takes eight firings, three weeks and a willingness to lose half of everything you make.', tags: ['Watches', 'Craft'] },
  { slug: 'caring-for-cashmere', title: 'The Gentle Science of Caring for Cashmere', category: 'Care', author: 'Margot Fairfax', role: 'Garment Care Specialist', date: '2026-08-14', read: 5, image: EDITORIAL.journal[6], excerpt: 'Washing, folding, resting and storing: a short guide to keeping cashmere soft for twenty winters.', tags: ['Care', 'Knitwear'] },
  { slug: 'florence-leather-district', title: 'A Morning in the Oltrarno', category: 'Travel', author: 'Sofia Marchetti', role: 'Senior Buyer', date: '2026-07-30', read: 7, image: EDITORIAL.journal[1], excerpt: 'Walking the Florentine lanes where our signature totes are cut, stitched and burnished by hand.', tags: ['Travel', 'Bags', 'Leather'] },
  { slug: 'listening-rooms', title: 'Notes on Listening Rooms', category: 'Culture', author: 'Sebastian Clarke', role: 'Audio Editor', date: '2026-07-16', read: 9, image: EDITORIAL.journal[4], excerpt: 'From Tokyo jazz kissa to London vinyl bars, the spaces that taught us how headphones should sound.', tags: ['Audio', 'Culture'] },
  { slug: 'the-perfect-white-shirt', title: 'In Search of the Perfect White Shirt', category: 'Style', author: 'James Harrington', role: 'Shirting Director', date: '2026-07-02', read: 6, image: EDITORIAL.journal[5], excerpt: 'Collar roll, yarn count and the thousand small decisions behind the most important garment a person can own.', tags: ['Shirts', 'Essentials'] },
  { slug: 'acetate-italy', title: 'Colour Held in Light: Italian Acetate', category: 'Craft', author: 'Isabelle Moreau', role: 'Eyewear Curator', date: '2026-06-18', read: 7, image: EDITORIAL.journal[7], excerpt: 'How a family mill near Lake Como turns cotton and wood pulp into the richest colours in eyewear.', tags: ['Eyewear', 'Craft'] },
  { slug: 'packing-for-a-week', title: 'Packing for a Week in a Single Weekender', category: 'Travel', author: 'Oliver Bancroft', role: 'Menswear Editor', date: '2026-06-04', read: 5, image: EDITORIAL.journal[8], excerpt: 'A disciplined approach to travelling light without ever feeling underdressed.', tags: ['Travel', 'Bags'] },
].map((post) => ({ ...post, body: BODY(post.title) }));

export const FAQS = {
  orders: [
    ['How do I place an order?', 'Add your chosen pieces to your bag and proceed to checkout. You may check out as a guest or create an account to save your details, track orders and access your wishlist from any device.'],
    ['Can I amend or cancel my order?', 'Orders may be amended or cancelled within two hours of placement from your account, or by contacting our concierge. After that, pieces enter preparation in our atelier and can be returned once received.'],
    ['Do you offer gift wrapping?', 'Every order arrives in our signature linen box. Complimentary gift wrapping with a handwritten card can be selected at checkout.'],
  ],
  shipping: [
    ['Is shipping complimentary?', 'We offer complimentary standard shipping on all orders over $250 worldwide. Express and next-day services are available at checkout.'],
    ['How long will delivery take?', 'Standard delivery takes three to five working days, express two working days, and next-day delivery is available in selected cities when ordered before 2pm.'],
    ['Do you ship internationally?', 'We deliver to more than 90 countries. Duties and taxes are calculated at checkout so there are no surprises on arrival.'],
  ],
  returns: [
    ['What is your returns policy?', 'You may return unworn pieces in their original condition within 30 days of delivery for a full refund. Return shipping is complimentary.'],
    ['How do I start a return?', 'Visit your order in your account and select Request a Return. We will email a prepaid label and, in many cities, can arrange a courier collection.'],
    ['When will I be refunded?', 'Refunds are issued to your original payment method within five working days of your return arriving at our atelier.'],
  ],
  payment: [
    ['Which payment methods do you accept?', 'We accept all major credit cards, PayPal, Apple Pay and, in selected regions, cash on delivery.'],
    ['Is my payment information secure?', 'All payments are encrypted and processed by certified payment partners. We never store full card details on our servers.'],
    ['Do you offer instalments?', 'Interest-free instalments are available on orders over $500 in selected regions at checkout.'],
  ],
  account: [
    ['How do I reset my password?', 'Select Forgot Password on the sign-in page and we will email a secure link valid for one hour.'],
    ['Can I save more than one address?', 'Yes, your account can hold as many delivery addresses as you need, with one set as your default.'],
    ['How do I unsubscribe from emails?', 'Every email includes an unsubscribe link, or you may manage preferences under Notifications in your account.'],
  ],
  product: [
    ['How do I find my size?', 'Each product page includes a size guide with precise garment measurements. Our concierge is also happy to advise by phone or chat.'],
    ['Are your materials responsibly sourced?', 'We work only with tanneries holding Leather Working Group Gold certification, mills that trace their fibre to the farm, and suppliers we visit in person every year.'],
    ['Do you offer repairs?', 'Every piece is covered by our lifetime repair service. Contact concierge and we will arrange collection.'],
  ],
};

/** Mock orders for account + admin. */
const STATUSES = ['delivered', 'shipped', 'processing', 'placed', 'delivered', 'out-for-delivery', 'delivered', 'cancelled'];
export const CUSTOMERS = NAMES.map((name, i) => ({
  id: `cu-${100 + i}`, name, email: `${name.split(' ')[0].toLowerCase()}.${name.split(' ')[1].toLowerCase()}@example.com`,
  avatar: EDITORIAL.portraits[i % EDITORIAL.portraits.length], city: ['London', 'Paris', 'Milan', 'New York', 'Tokyo', 'Copenhagen'][i % 6],
  joined: new Date(Date.UTC(2024, i, 3 + i)).toISOString(), orders: 2 + ((i * 3) % 9), spent: 1200 + ((i * 2731) % 18000), segment: i % 4 === 0 ? 'VIP' : i % 3 === 0 ? 'New' : 'Returning',
}));
export const ORDERS = Array.from({ length: 36 }, (_, i) => {
  const items = [PRODUCTS[(i * 7) % PRODUCTS.length], PRODUCTS[(i * 11 + 3) % PRODUCTS.length]].slice(0, 1 + (i % 2)).map((pr, k) => ({ id: pr.id, qty: 1 + ((i + k) % 2), price: pr.compareAt ? pr.price : pr.price, color: pr.colors[0]?.name, size: pr.sizes[0] ?? null }));
  const subtotal = items.reduce((s, it) => s + it.qty * it.price, 0);
  const shipping = subtotal > 250 ? 0 : 18;
  const tax = Math.round(subtotal * 0.08);
  return {
    id: `MV-${240930 - i * 37}`, customerId: CUSTOMERS[i % CUSTOMERS.length].id, date: new Date(Date.UTC(2026, 8, 29) - i * 86400000 * 2.3).toISOString(),
    status: STATUSES[i % STATUSES.length], items, subtotal, shipping, tax, discount: i % 5 === 0 ? Math.round(subtotal * 0.1) : 0,
    get total() { return this.subtotal + this.shipping + this.tax - this.discount; },
    address: { name: CUSTOMERS[i % CUSTOMERS.length].name, line1: `${12 + i} Marylebone High Street`, city: 'London', zip: 'W1U 4NR', country: 'United Kingdom' },
    payment: i % 3 === 0 ? 'Apple Pay' : 'Visa ending 4242', method: i % 2 ? 'Express' : 'Standard',
  };
});

export const COUPONS = [
  { code: 'SAVE10', type: 'percent', value: 10, min: 0, used: 412, limit: 1000, expires: '2026-12-31', status: 'active' },
  { code: 'WELCOME15', type: 'percent', value: 15, min: 150, used: 1289, limit: null, expires: '2027-06-30', status: 'active' },
  { code: 'FREESHIP', type: 'shipping', value: 0, min: 0, used: 2204, limit: null, expires: '2026-12-31', status: 'active' },
  { code: 'ATELIER250', type: 'fixed', value: 250, min: 2000, used: 38, limit: 100, expires: '2026-10-31', status: 'active' },
  { code: 'SUMMER24', type: 'percent', value: 20, min: 300, used: 900, limit: 900, expires: '2024-08-31', status: 'expired' },
  { code: 'VIPNIGHT', type: 'percent', value: 25, min: 1000, used: 0, limit: 50, expires: '2026-11-20', status: 'scheduled' },
];
export const PROMOS = { SAVE10: { type: 'percent', value: 10, label: '10% off your order' }, WELCOME15: { type: 'percent', value: 15, label: '15% welcome privilege' }, FREESHIP: { type: 'shipping', value: 0, label: 'Complimentary express shipping' } };

export const STAFF = [
  { name: 'Charlotte Vale', email: 'charlotte@maisonverdant.com', role: 'Owner', last: '2 minutes ago', avatar: EDITORIAL.portraits[3] },
  { name: 'Henry Ashdown', email: 'henry@maisonverdant.com', role: 'Admin', last: '1 hour ago', avatar: EDITORIAL.portraits[1] },
  { name: 'Sofia Marchetti', email: 'sofia@maisonverdant.com', role: 'Editor', last: 'Yesterday', avatar: EDITORIAL.portraits[0] },
  { name: 'Lucas Beaumont', email: 'lucas@maisonverdant.com', role: 'Support', last: '3 days ago', avatar: EDITORIAL.portraits[2] },
];
export const ANNOUNCEMENTS = ['Complimentary shipping and returns on orders over $250', 'The Autumn Coat Edit has arrived', 'Book a private appointment at our Marylebone atelier', 'Lifetime repairs on every piece we make'];
