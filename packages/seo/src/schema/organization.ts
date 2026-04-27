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
    name,
    url: baseUrl,
    logo: `${baseUrl}/logo.png`,
    sameAs: [],
    correctionsPolicy: `${baseUrl}/corrections`,
    ethicsPolicy: `${baseUrl}/ethics`,
  }
}
