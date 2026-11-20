/**
 * AppleNovelApp source adapter contract, version 1.
 *
 * The app provides a restricted http.get(url) bridge. Do not use global fetch,
 * XMLHttpRequest, filesystem, eval, dynamic import, or unrestricted APIs.
 * Every requested host must be listed in the source JSON "domains" allowlist.
 */
module.exports = {
  async search({ keyword, page = 1, http }) {
    // Return: [{ title, author, bookUrl, coverUrl?, intro? }]
    throw new Error("请为目标站点实现 search()");
  },

  async getBookDetail({ bookUrl, http }) {
    // Return: { title, author?, intro?, coverUrl?, latestChapter? }
    throw new Error("请为目标站点实现 getBookDetail()");
  },

  async getChapters({ bookUrl, http }) {
    // Return: [{ title, chapterUrl, index }]
    throw new Error("请为目标站点实现 getChapters()");
  },

  async getContent({ chapterUrl, http }) {
    // Return: { title?, content }
    throw new Error("请为目标站点实现 getContent()");
  }
};
