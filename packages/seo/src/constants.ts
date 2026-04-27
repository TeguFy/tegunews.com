export const SEO_LIMITS = {
  titleMin: 10,
  titleMax: 110,           // Google News tolerates longer headlines
  seoTitleMin: 30,
  seoTitleMax: 70,         // News tabs trim around 70 chars
  seoDescMin: 120,
  seoDescMax: 160,
  slugMax: 80,
  contentMinChars: 300,
  contentMinWords: 80,     // shorter floor than reviews; news pieces can be brief
  altTextMax: 125,
  ogImageMinWidth: 1200,
  ogImageMinHeight: 630,
  keywordDensityMin: 0.5,
  keywordDensityMax: 3.0,
  readingTimeWPM: 220,     // news skews skim-read
  internalLinksMin: 1,
  // Google News window — articles within this many hours appear in
  // <news:news> sitemap entries.
  newsRecencyHours: 48,
} as const

export const SEO_PENALTIES = {
  missingFeaturedImage: 30,
  missingFeaturedImageAlt: 15,
  missingCategory: 20,
  missingFocusKeyword: 25,
  keywordNotInTitle: 10,
  keywordNotInH1: 8,
  keywordNotInFirst100Words: 5,
  seoTitleTooShort: 5,
  seoTitleTooLong: 5,
  seoDescTooShort: 5,
  seoDescTooLong: 5,
  thinContent: 20,
  noInternalLinks: 10,
  keywordStuffing: 15,
} as const
