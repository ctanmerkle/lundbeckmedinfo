import { loadCatalog } from '../../scripts/medinfo-catalog.js';

/**
 * Builds a labelled native <select>. Native selects are used for accessibility
 * and mobile support; the legacy site's custom-styled dropdowns can be layered
 * on later with CSS if a pixel match is required.
 * @param {string} id
 * @param {string} placeholder Disabled first option (e.g. "Select a Product*")
 * @param {Array<{value: string, label: string}>} options
 */
function buildSelect(id, placeholder, options) {
  const select = document.createElement('select');
  select.id = id;
  select.name = id;
  select.required = true;

  const first = document.createElement('option');
  first.textContent = placeholder;
  first.value = '';
  first.selected = true;
  first.disabled = true;
  select.append(first);

  options.forEach(({ value, label }) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    select.append(opt);
  });
  return select;
}

/**
 * Decorates the Medical Information search form.
 *
 * Content model (authored as a two-row block):
 *   | search-form                                    |
 *   | Results path | /us/en/hcp/search-results       |
 *   | Intro        | Select a product and a category…|
 *
 * Product and Category options are read from the published catalog so authors
 * maintain them in one place (the spreadsheet), not in the block.
 */
export default async function decorate(block) {
  const config = {};
  [...block.children].forEach((row) => {
    const [key, value] = [...row.children];
    if (key && value) config[key.textContent.trim().toLowerCase()] = value.textContent.trim();
  });
  const resultsPath = config['results path'] || '/us/en/hcp/search-results';
  const intro = config.intro
    || 'Select a product and a category to search for specific product information. '
      + 'You may optionally input one or more keywords to narrow your search results.';

  block.textContent = '';

  const form = document.createElement('form');
  form.className = 'search-form-fields';
  form.action = resultsPath;
  form.method = 'get';
  form.setAttribute('novalidate', 'novalidate');

  const introEl = document.createElement('p');
  introEl.className = 'search-form-intro';
  introEl.textContent = intro;
  form.append(introEl);

  const controls = document.createElement('div');
  controls.className = 'search-form-controls';
  form.append(controls);

  let products = [];
  let categories = [];
  try {
    ({ products, categories } = await loadCatalog());
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('search-form: catalog unavailable', error);
  }

  const productSelect = buildSelect(
    'product',
    'Select a Product*',
    products.map((p) => ({ value: p.Key, label: p.Name })),
  );
  const categorySelect = buildSelect(
    'category',
    'Category*',
    categories.map((c) => ({ value: c.Name, label: c.Name })),
  );

  const productWrap = document.createElement('div');
  productWrap.className = 'search-form-field search-form-product';
  productWrap.append(productSelect);

  const categoryWrap = document.createElement('div');
  categoryWrap.className = 'search-form-field search-form-category';
  categoryWrap.append(categorySelect);

  const keywordWrap = document.createElement('div');
  keywordWrap.className = 'search-form-field search-form-keyword';
  const keywordInput = document.createElement('input');
  keywordInput.type = 'text';
  keywordInput.id = 'keyword';
  keywordInput.name = 'keyword';
  keywordInput.placeholder = 'Keyword(s)';
  keywordInput.setAttribute('aria-label', 'Keywords');
  const keywordHint = document.createElement('p');
  keywordHint.className = 'search-form-hint';
  keywordHint.textContent = 'Separate multiple terms with a comma.';
  keywordWrap.append(keywordInput, keywordHint);

  const submitWrap = document.createElement('div');
  submitWrap.className = 'search-form-field search-form-submit';
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'search-form-button';
  submit.textContent = 'Search';
  const disclaimer = document.createElement('p');
  disclaimer.className = 'search-form-disclaimer';
  disclaimer.textContent = 'By searching, I confirm my query is unsolicited.';
  submitWrap.append(submit, disclaimer);

  controls.append(productWrap, categoryWrap, keywordWrap, submitWrap);

  const error = document.createElement('p');
  error.className = 'search-form-error';
  error.setAttribute('role', 'alert');
  error.hidden = true;
  form.append(error);

  form.addEventListener('submit', (event) => {
    if (!productSelect.value || !categorySelect.value) {
      event.preventDefault();
      error.textContent = 'Please select both a product and a category.';
      error.hidden = false;
    }
  });

  block.append(form);
}
