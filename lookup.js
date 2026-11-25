(() => {
  "use strict";

  const status = document.querySelector("#lookup-status");
  const results = document.querySelector("#results");
  const switcher = document.querySelector("#lookup-switcher");
  const entry = document.querySelector("#entry");
  const onlineButton = document.querySelector("#lookup-online");

  const missingButton = document.querySelector("#lookup-missing");

  const wikidata = "https://www.wikidata.org";
  const languages = ["zh-hans", "zh-cn", "zh", "zh-hant", "zh-tw", "en", "mul"];
  const factProperties = [
    ["P31", "类别"], ["P279", "上位类别"], ["P106", "职业"], ["P27", "国籍"],
    ["P50", "作者"], ["P170", "创作者"], ["P57", "导演"], ["P86", "作曲"],
    ["P136", "体裁"], ["P495", "起源地"], ["P17", "所在国家"],
    ["P131", "行政区"], ["P361", "所属系列或整体"], ["P186", "材料"],
    ["P366", "用途"], ["P171", "上级分类"]
  ];
  const starterCard = {
    title: "囚牛",
    description: "中国民间传说中，龙生九子之一。",
    facts: [
      ["读音", ["qiú niú"]],
      ["喜好", ["相传爱好音乐"]],
      ["传统形象", ["明代李东阳将胡琴琴头的兽形雕刻与囚牛联系起来"]]
    ]
  };

  const cacheKey = "word-guess:wikidata-cards:v1";
  const cacheLimit = 32;
  const savedCards = new Map(readCache().map(card => [card.id, card]));
  const catalogReady = fetch("./data/wikidata-zh.json", { signal: AbortSignal.timeout(5000) })
    .then(response => {
      if (!response.ok) throw new Error("Wikidata catalog unavailable");
      return response.json();
    })
    .then(data => data.items.map(validateCard).filter(Boolean))
    .catch(() => null);

  const starterOption = { card: starterCard, complete: true };
  let currentLookup = {
    term: starterCard.title, options: [starterOption], selected: starterOption, localAvailable: true
  };
  let activeRequest;

  function element(tag, value, className) {
    const node = document.createElement(tag);
    if (value) node.textContent = value;
    if (className) node.className = className;
    return node;
  }

  function link(label, url) {
    const node = element("a", label);
    node.href = url;
    node.target = "_blank";
    node.rel = "noopener noreferrer";
    return node;
  }

  function renderCard(card) {
    entry.replaceChildren();
    entry.hidden = !card;
    if (!card) return;

    const { title, description, aliases, facts, id } = card;
    const heading = element("h3", title);
    heading.id = "entry-title";
    entry.append(heading);
    if (description || card.custom) entry.append(element("p", description || "描述待补充", card.custom ? "custom-description" : ""));
    if (aliases?.length) entry.append(element("p", `别名：${aliases.join("、")}`, "aliases"));
    if (facts?.length) {
      const list = element("dl");
      for (const [label, values] of facts) {
        list.append(element("dt", label), element("dd", values.join("、")));
      }
      entry.append(list);
    }

    const source = element("footer");
    if (card.custom) {
      source.textContent = "本地词库";
    } else if (id) {
      source.append(link(`Wikidata（${id}）`, `${wikidata}/wiki/${id}`), " · ", link(
        "CC0", `${wikidata}/wiki/Wikidata:Copyright/zh`
      ));
    } else {
      source.append("本地编写 · 参考 ", link(
        "李东阳《记龙生九子》",
        "https://www.shidianguji.com/book/HY1130/chapter/1kvmfclsw6ujm"
      ));
    }
    entry.append(source);
  }

  function isItemId(id) {
    return typeof id === "string" && /^Q[1-9]\d*$/.test(id);
  }

  function validateCard(card) {
    if (!isItemId(card?.id) || typeof card.title !== "string" || !card.title.trim()) return;
    const description = typeof card.description === "string" ? card.description : "";
    const aliases = Array.isArray(card.aliases) ? card.aliases.filter(value => typeof value === "string") : [];
    const facts = Array.isArray(card.facts) ? card.facts.filter(fact =>
      Array.isArray(fact) && typeof fact[0] === "string" && Array.isArray(fact[1]) &&
      fact[1].length && fact[1].every(value => typeof value === "string")
    ) : [];
    return { id: card.id, title: card.title, description, aliases, facts, summaryOnly: card.summaryOnly === true };
  }

  function readCache() {
    try {
      return JSON.parse(localStorage.getItem(cacheKey) || "[]").slice(-cacheLimit).map(validateCard).filter(Boolean);
    } catch {
      return [];
    }
  }

  function saveCards(cards) {
    for (const card of cards) {
      if (card.summaryOnly && savedCards.has(card.id)) continue;
      savedCards.set(card.id, card);
      if (savedCards.size > cacheLimit) savedCards.delete(savedCards.keys().next().value);
    }
    try {
      localStorage.setItem(cacheKey, JSON.stringify([...savedCards.values()]));
    } catch {
      // The current page can still use the in-memory cache.
    }
  }

  function normalize(value) {
    return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
  }

  function exactMatches(cards, term) {
    const key = normalize(term);
    const titles = [];
    const alternatives = [];
    for (const card of cards) {
      if (normalize(card.title) === key) titles.push(card);
      else if (normalize(card.id || "") === key || card.aliases?.some(name => normalize(name) === key)) {
        alternatives.push(card);
      }
    }
    return [...titles, ...alternatives];
  }

  function findLocal(term, catalog) {
    const items = new Map(savedCards);
    for (const card of catalog || []) items.set(card.id, card);
    return exactMatches([starterCard, ...items.values()], term)
      .map(card => ({ card, complete: !card.summaryOnly }));
  }

  function renderOptions(lookup) {
    results.replaceChildren();
    switcher.hidden = lookup.options.length < 2;
    if (switcher.hidden) return;

    for (const option of lookup.options) {
      const button = element("button", "", "result-option");
      button.type = "button";
      button.setAttribute("aria-pressed", String(option === lookup.selected));
      button.setAttribute("aria-controls", "entry");
      button.append(element("strong", option.card.title));
      const source = option.card.custom ? "本地词库" : option.card.id ? "Wikidata" : "内置词条";
      button.append(element("span", [source, option.card.description || option.card.id].filter(Boolean).join(" · ")));
      button.addEventListener("click", () => {
        cancelOnline();
        selectOption(lookup, option);
        if (!option.complete) requestDetails(lookup, option);
      });
      results.append(button);
    }
  }

  function selectOption(lookup, option) {
    lookup.selected = option;
    for (const [index, button] of [...results.children].entries()) {
      button.setAttribute("aria-pressed", String(lookup.options[index] === option));
    }
    renderCard(option.card);
    status.textContent = "";
    resetOnlineButton(lookup);
  }

  function resetOnlineButton(lookup) {
    const needsDetails = lookup.selected && !lookup.selected.complete;
    onlineButton.textContent = needsDetails ? "加载词条详情" : "查找更多 Wikidata 词条";
    onlineButton.hidden = !needsDetails && lookup.onlineOffset === null;
  }

  function cancelOnline() {
    activeRequest?.abort();
    activeRequest = undefined;
    onlineButton.disabled = false;
  }

  async function runOnline(work, failure, timeout = "Wikidata 响应超时，请重试。") {
    cancelOnline();
    const controller = new AbortController();
    activeRequest = controller;
    onlineButton.disabled = true;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 7500);
    try {
      await work(controller.signal);
    } catch {
      if (activeRequest === controller) {
        status.textContent = timedOut ? timeout : failure;
        onlineButton.textContent = "重试 Wikidata";
        onlineButton.hidden = false;
      }
    } finally {
      clearTimeout(timer);
      if (activeRequest === controller) {
        activeRequest = undefined;
        onlineButton.disabled = false;
      }
    }
  }

  async function getData(params, signal) {
    const url = new URL("/w/api.php", wikidata);
    url.search = new URLSearchParams({
      ...params, format: "json", origin: "*", uselang: "zh-hans"
    });
    const response = await fetch(url, { credentials: "omit", signal });
    if (!response.ok) throw new Error(`Wikidata HTTP ${response.status}`);
    const data = await response.json();
    signal.throwIfAborted();
    if (data.error) throw new Error(data.error.code);
    return data;
  }

  function localized(values = {}) {
    return languages.map(language => values[language]?.value).find(Boolean);
  }

  function factIds(claims = {}) {
    const facts = [];
    for (const [property, label] of factProperties) {
      const statements = claims[property] || [];
      const preferred = statements.some(statement => statement.rank === "preferred");
      const ids = statements.filter(statement => statement.rank === (preferred ? "preferred" : "normal"))
        .map(statement => statement.mainsnak?.datavalue?.value?.id)
        .filter(isItemId);
      if (ids.length) facts.push([label, [...new Set(ids)].slice(0, 3)]);
      if (facts.length === 5) break;
    }
    return facts;
  }

  function getEntities(ids, props, signal) {
    return getData({
      action: "wbgetentities",
      ids: ids.join("|"),
      props,
      languages: languages.join("|")
    }, signal);
  }

  async function loadCard(option, signal) {
    status.textContent = "正在加载词条详情…";
    const { card: summary } = option;
    const { entities } = await getEntities([summary.id], "labels|descriptions|aliases|claims", signal);
    signal.throwIfAborted();
    const item = entities?.[summary.id] || Object.values(entities || {})[0];
    if (!item || Object.hasOwn(item, "missing")) throw new Error("Missing Wikidata item");
    const title = localized(item.labels) || summary.title;
    const description = localized(item.descriptions) || summary.description;
    const aliases = languages.flatMap(language => item.aliases?.[language] || [])
      .map(alias => alias.value)
      .filter(alias => alias && alias !== title);
    const card = {
      id: isItemId(item.id) ? item.id : summary.id,
      title, description, aliases: [...new Set([...(summary.aliases || []), ...aliases])].filter(alias => alias !== title).slice(0, 6)
    };
    option.card = card;
    renderCard(card);

    const facts = factIds(item.claims);
    if (facts.length) {
      const ids = [...new Set(facts.flatMap(([, ids]) => ids))];
      const { entities: related } = await getEntities(ids, "labels", signal);
      signal.throwIfAborted();
      card.facts = facts.map(([label, values]) => [
        label, values.map(value => localized(related?.[value]?.labels)).filter(Boolean)
      ]).filter(([, values]) => values.length);
      renderCard(card);
    }
    option.complete = true;
    resetOnlineButton(currentLookup);
    saveCards([card]);
    status.textContent = "";
  }

  function requestDetails(lookup, option) {
    runOnline(async signal => {
      await loadCard(option, signal);
      resetOnlineButton(lookup);
    }, "词条详情暂时无法加载。");
  }

  function searchOnline(lookup) {
    const coverage = lookup.localAvailable ? "已收录词条中未找到。" : "已收录词条暂时无法读取。";
    const prefix = lookup.options.length ? "" : coverage;
    status.textContent = `${prefix}正在查询 Wikidata…`;
    runOnline(async signal => {
      const data = await getData({
        action: "wbsearchentities",
        search: lookup.term,
        language: "zh-hans",
        type: "item",
        limit: "6",
        continue: lookup.onlineOffset || "0"
      }, signal);
      signal.throwIfAborted();
      lookup.onlineOffset = Number.isInteger(data["search-continue"]) ? data["search-continue"] : null;
      const present = new Set(lookup.options.map(option => option.card.id));
      const candidates = (data.search || [])
        .filter(hit => isItemId(hit.id) && typeof hit.label === "string" && hit.label && !present.has(hit.id))
        .map(hit => {
          const names = [...(hit.aliases || [])];
          if (["alias", "label"].includes(hit.match?.type)) names.push(hit.match.text);
          const aliases = names.filter(name => typeof name === "string" && name !== hit.label);
          return { id: hit.id, title: hit.label, description: hit.description, aliases };
        });
      const additional = exactMatches(candidates, lookup.term).map(card => ({ card, complete: false }));
      if (additional.length) {
        saveCards(additional.map(({ card }) => ({ ...card, summaryOnly: true })));
        lookup.options.push(...additional);
        if (!lookup.selected) selectOption(lookup, additional[0]);
        renderOptions(lookup);
      }
      resetOnlineButton(lookup);
      if (!additional.length) {
        status.textContent = lookup.onlineOffset !== null
          ? "当页没有更多完全匹配的词条，可继续查找。"
          : `${prefix}Wikidata 没有更多完全匹配的词条。`;
      } else if (lookup.selected.complete) {
        status.textContent = `Wikidata 找到 ${additional.length} 条额外结果。`;
      } else {
        await loadCard(lookup.selected, signal);
      }
    }, `${prefix}暂时无法加载 Wikidata 资料。`, `${prefix}Wikidata 响应超时，请重试。`);
  }

  async function lookupWord(term) {
    cancelOnline();
    const lookup = { term, options: [], selected: null, localAvailable: false };
    currentLookup = lookup;
    renderOptions(lookup);
    renderCard();
    onlineButton.hidden = true;
    const custom = window.localDictionary.find(term);
    missingButton.disabled = Boolean(custom);
    missingButton.textContent = custom ? "已加入本地词库" : "找不到";
    missingButton.title = custom ? "可在设置的本地词库中编辑" : "将当前关键词加入本地词库";
    if (custom) {
      const option = { card: { title: custom.keyword, description: custom.description, custom: true }, complete: true };
      lookup.options.push(option);
      lookup.selected = option;
      renderCard(option.card);
      status.textContent = "";
    } else {
      status.textContent = "正在查找已收录词条…";
    }

    const catalog = await catalogReady;
    if (currentLookup !== lookup) return;
    lookup.localAvailable = catalog !== null;
    lookup.options.push(...findLocal(term, catalog));

    if (lookup.options.length) {
      selectOption(lookup, lookup.options[0]);
      renderOptions(lookup);
    } else {
      searchOnline(lookup);
    }
  }

  document.addEventListener("word-confirmed", event => lookupWord(event.detail));
  document.addEventListener("dictionary-changed", () => {
    const { term } = currentLookup;
    if (currentLookup.options.some(option => option.card.custom) || window.localDictionary.find(term)) lookupWord(term);
  });

  missingButton.addEventListener("click", () => {
    try {
      window.localDictionary.save({ keyword: currentLookup.term, description: "" });
    } catch (error) {
      status.textContent = error.message;
    }
  });

  onlineButton.addEventListener("click", () => {
    const selected = currentLookup.selected;
    if (selected && !selected.complete) requestDetails(currentLookup, selected);
    else searchOnline(currentLookup);
  });
  renderCard(starterCard);
  onlineButton.hidden = false;
})();
