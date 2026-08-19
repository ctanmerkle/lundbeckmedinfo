import { loadCatalog, filterDocuments } from '../../scripts/medinfo-catalog.js';

/**
 * Creates a "View" link styled as a button.
 * @param {string} href
 */
function viewLink(href) {
  const a = document.createElement('a');
  a.className = 'search-results-view';
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = 'View';
  return a;
}

/**
 * Renders one product group: the Full Prescribing Information row, a
 * Description/Access header, and the list of matching documents.
 * @param {object} product Catalog product row
 * @param {object[]} docs Matching documents for this product
 */
function renderProductGroup(product, docs) {
  const group = document.createElement('div');
  group.className = 'search-results-group';

  // Product header + Full Prescribing Information row (always shown).
  const header = document.createElement('div');
  header.className = 'search-results-product';

  const title = document.createElement('h4');
  const titleLink = document.createElement('a');
  titleLink.href = product.Anchor || '#';
  titleLink.textContent = product.Name;
  title.append(titleLink);

  const piTitle = document.createElement('h5');
  piTitle.textContent = product.PITitle || 'Full Prescribing Information';

  header.append(title, piTitle);
  if (product.PIUrl) header.append(viewLink(product.PIUrl));
  group.append(header);

  if (!docs.length) {
    const none = document.createElement('p');
    none.className = 'search-results-none';
    none.textContent = 'No results found. Please modify your search criteria and try again.';
    group.append(none);
  }

  // Description / Access column headings.
  const colHead = document.createElement('div');
  colHead.className = 'search-results-colhead';
  const desc = document.createElement('h6');
  desc.textContent = 'Description';
  const access = document.createElement('h6');
  access.textContent = 'Access';
  colHead.append(desc, access);
  group.append(colHead);

  if (docs.length) {
    const list = document.createElement('ul');
    list.className = 'search-results-list';
    docs.forEach((doc) => {
      const li = document.createElement('li');
      const p = document.createElement('p');
      p.textContent = doc.Title;
      li.append(p, viewLink(doc.Url));
      list.append(li);
    });
    group.append(list);
  }

  return group;
}

/**
 * Decorates the search results block.
 *
 * Reads `product`, `category`, and `keyword` from the URL query string,
 * fetches the author-maintained catalog, filters client-side, and renders the
 * results grouped by product. This replaces the legacy server-side query.
 */
export default async function decorate(block) {
  block.textContent = '';

  const params = new URLSearchParams(window.location.search);
  const product = params.get('product') || '';
  const category = params.get('category') || '';
  const keyword = params.get('keyword') || '';

  const heading = document.createElement('h2');
  heading.className = 'search-results-heading';
  block.append(heading);

  const body = document.createElement('div');
  body.className = 'search-results-body';
  block.append(body);

  let catalog;
  try {
    catalog = await loadCatalog();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('search-results: catalog unavailable', error);
    heading.textContent = 'Search is temporarily unavailable';
    return;
  }

  const productRow = catalog.products.find((p) => p.Key === product);
  const docs = filterDocuments(catalog.documents, { product, category, keyword });

  heading.textContent = `${docs.length} Results: ${category}`;

  if (!productRow) {
    const msg = document.createElement('p');
    msg.className = 'search-results-none';
    msg.textContent = 'Please select a product and a category to search.';
    body.append(msg);
    return;
  }

  body.append(renderProductGroup(productRow, docs));
}
