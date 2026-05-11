/**
 * News publishers should use `NewsMediaOrganization` over the bare
 * `Organization`. It supports `diversityPolicy`, `ethicsPolicy`,
 * `correctionsPolicy` properties that Google News surfaces in the
 * Publisher Center.
 */
export function generateOrganizationSchema(baseUrl: string, name = 'TeguNews') {
  return {
    '@context': 'https://schema.org',
    '@type': 'NewsMediaOrganization',
    '@id': `${baseUrl}/#publisher`,
    name,
    url: baseUrl,
    logo: {
      '@type': 'ImageObject',
      url: `${baseUrl}/logo.png`,
      width: 512,
      height: 512,
    },
    sameAs: [],
    correctionsPolicy: `${baseUrl}/corrections`,
    ethicsPolicy: `${baseUrl}/ethics`,
  }
}
