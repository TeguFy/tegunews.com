export function generateWebsiteSchema(baseUrl: string, name = 'TeguNews') {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name,
    url: baseUrl,
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${baseUrl}/search?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  }
}
