/**
 * Shared data-access helpers for the Medical Information document search.
 *
 * The catalog is an author-maintained spreadsheet published by Edge Delivery as
 * a multi-sheet JSON (`products`, `categories`, `documents`). This module hides
 * the fetch/parse details so the search-form and search-results blocks share one
 * source of truth. Replaces the server-side query that the legacy AEM site ran.
 */

const DEFAULT_CATALOG = '/medinfo-catalog.json';
let catalogPromise;

/**
 * Fetches and caches the catalog for the lifetime of the page.
 * @param {string} [path] Path to the published catalog JSON
 * @returns {Promise<{products: object[], categories: object[], documents: object[]}>}
 */
export async function loadCatalog(path = DEFAULT_CATALOG) {
  if (!catalogPromise) {
    catalogPromise = (async () => {
      const resp = await fetch(path);
      if (!resp.ok) throw new Error(`Unable to load catalog: ${resp.status}`);
      const json = await resp.json();
      // Multi-sheet publish shape: each named sheet has its own `.data` array.
      // Single-sheet fallback: the top-level object is the sheet itself.
      const sheet = (name) => (json[name] && json[name].data) || [];
      return {
        products: sheet('products'),
        categories: sheet('categories'),
        documents: json.documents ? sheet('documents') : (json.data || []),
      };
    })().catch((error) => {
      catalogPromise = undefined; // allow a later retry
      throw error;
    });
  }
  return catalogPromise;
}

/**
 * Splits a raw keyword string ("a, b c") into normalised terms.
 * @param {string} keyword
 * @returns {string[]} lower-cased, comma-separated terms (empty array if none)
 */
export function parseKeywords(keyword) {
  if (!keyword) return [];
  return keyword
    .split(',')
    .map((term) => term.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Filters documents by product, category, and optional keyword terms.
 * A document matches when its title contains ANY of the supplied terms,
 * mirroring the legacy behaviour where more terms broaden the result set.
 * @param {object[]} documents
 * @param {{product: string, category: string, keyword?: string}} query
 * @returns {object[]}
 */
export function filterDocuments(documents, { product, category, keyword }) {
  const terms = parseKeywords(keyword);
  return documents.filter((doc) => {
    if (product && doc.Product !== product) return false;
    if (category && doc.Category !== category) return false;
    if (terms.length) {
      const haystack = (doc.Title || '').toLowerCase();
      return terms.some((term) => haystack.includes(term));
    }
    return true;
  });
}
