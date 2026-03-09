async function getFirstSummary(query) {
  const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=10`;
  const searchRes = await fetch(searchUrl);
  const searchData = await searchRes.json();

  if (!searchData?.query?.search?.length) {
    return { error: `No Wikipedia results found for '${query}'.` };
  }

  for (const result of searchData.query.search) {
    const pageId = result.pageid;
    console.log(`Checking Wikipedia page ID: ${pageId} (Title: ${result.title}) for query: ${query}`);

    const extractUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts|pageprops&exintro&explaintext&pageids=${pageId}&format=json`;
    const extractRes = await fetch(extractUrl);
    const extractData = await extractRes.json();

    const pageData = extractData?.query?.pages?.[String(pageId)];
    if (!pageData) { console.warn(`Could not retrieve detailed page data for ID: ${pageId}. Skipping.`); continue; }
    if (pageData?.pageprops?.disambiguation) { console.log(`Page ID ${pageId} is a disambiguation page. Skipping.`); continue; }
    if (!pageData.extract?.trim()) { console.log(`No extract found for page ID: ${pageId}. Skipping.`); continue; }

    console.log(`Successfully retrieved extract for page ID: ${pageId}`);
    return { summary: pageData.extract };
  }

  return { error: `No suitable Wikipedia results found for '${query}'.` };
}

export default function (app) {
  app.get('/wiki/:query', async (req, res) => {
    const { query } = req.params;
    if (!query?.trim()) return res.status(400).json({ error: 'Query parameter is required.' });

    try {
      const result = await getFirstSummary(query);
      if (result.error) return res.status(404).json(result);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: `An error occurred while fetching the summary: ${err.message}` });
    }
  });
}
