export function generateWebsiteSchema(baseUrl: string, name = 'TeguNews') {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${baseUrl}/#website`,
    name,
    url: baseUrl,
    inLanguage: ['en', 'vi'],
    publisher: { '@id': `${baseUrl}/#publisher` },
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${baseUrl}/search?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  }
}
