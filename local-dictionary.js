(() => {
  "use strict";

  const storageKey = "word-guess.local-dictionary.v1";

  function keyOf(word) {
    return word.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
  }

  function validate(entry) {
    if (typeof entry?.keyword !== "string" || !entry.keyword.trim() || entry.keyword.trim().length > 40) {
      throw new Error("关键词必须为 1 到 40 个字符。");
    }
    if (/[\r\n]/.test(entry.keyword.trim())) throw new Error("关键词只能占一行。");
    if (typeof entry.description !== "string") {
      throw new Error("描述应为文本，待补写时可使用空字符串。");
    }
    return { keyword: entry.keyword.trim(), description: entry.description.trim() };
  }

  function parseEntries(entries) {
    if (!Array.isArray(entries)) throw new Error("JSON 应为包含 keyword 和 description 的词条数组。");
    const parsed = new Map();
    for (const [index, entry] of entries.entries()) {
      try {
        const checked = validate(entry);
        const key = keyOf(checked.keyword);
        if (parsed.has(key)) throw new Error(`关键词“${checked.keyword}”重复。`);
        parsed.set(key, checked);
      } catch (error) {
        throw new Error(`第 ${index + 1} 条：${error.message}`);
      }
    }
    return parsed;
  }

  function read() {
    let data;
    try {
      data = localStorage.getItem(storageKey);
    } catch {
      throw new Error("无法读取本地词库，请检查浏览器的存储权限。");
    }
    if (data === null) return new Map();
    try {
      return parseEntries(JSON.parse(data));
    } catch {
      throw new Error("已保存的本地词库格式异常，无法读取。");
    }
  }

  function write(entries) {
    try {
      localStorage.setItem(storageKey, JSON.stringify([...entries.values()]));
    } catch {
      throw new Error("无法保存到当前浏览器，请检查可用空间或本地存储权限。");
    }
    document.dispatchEvent(new Event("dictionary-changed"));
  }

  window.localDictionary = {
    list() {
      return [...read().values()];
    },
    find(term) {
      try {
        return read().get(keyOf(term));
      } catch {
        // The built-in catalog remains available when browser storage cannot be read.
        return undefined;
      }
    },
    save(entry, originalKeyword = null) {
      const checked = validate(entry);
      const entries = read();
      const key = keyOf(checked.keyword);
      const original = originalKeyword === null ? null : keyOf(originalKeyword);
      if (original !== null && !entries.has(original)) throw new Error("原词条已被删除，请重新新增。");
      if (original !== key && entries.has(key)) throw new Error("这个关键词已经存在，请编辑已有词条。");
      if (original !== null && original !== key) entries.delete(original);
      entries.set(key, checked);
      write(entries);
    },
    remove(keyword) {
      const entries = read();
      if (entries.delete(keyOf(keyword))) write(entries);
    },
    importEntries(values) {
      const incoming = parseEntries(values);
      const entries = read();
      let updated = 0;
      for (const [key, entry] of incoming) {
        if (entries.has(key)) updated++;
        entries.set(key, entry);
      }
      if (incoming.size) write(entries);
      return { added: incoming.size - updated, updated };
    }
  };

  window.addEventListener("storage", event => {
    if (event.key === storageKey || event.key === null) {
      document.dispatchEvent(new Event("dictionary-changed"));
    }
  });
})();
