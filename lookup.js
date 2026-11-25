(() => {
  "use strict";

  const form = document.querySelector("#lookup-form");
  const query = document.querySelector("#query");
  const status = document.querySelector("#lookup-status");
  const results = document.querySelector("#results");
  const entry = document.querySelector("#entry");
  const credit = document.createElement("span");
  document.querySelector("#lookup-source").prepend(credit);

  const wikidata = "https://www.wikidata.org";
  const languages = ["zh-hans", "zh-cn", "zh", "zh-hant", "zh-tw", "en", "mul"];
  const factProperties = [
    ["P31", "类别"], ["P279", "上位类别"], ["P106", "职业"], ["P27", "国籍"],
    ["P50", "作者"], ["P170", "创作者"], ["P57", "导演"], ["P86", "作曲"],
    ["P136", "体裁"], ["P495", "起源地"], ["P17", "所在国家"],
    ["P131", "行政区"], ["P361", "所属系列或整体"], ["P186", "材料"],
    ["P366", "用途"], ["P171", "上级分类"]
  ];
  const localCard = {
    title: "囚牛",
    description: "中国民间传说中，龙生九子之一。",
    facts: [
      ["读音", ["qiú niú"]],
      ["喜好", ["相传爱好音乐"]],
      ["传统形象", ["明代李东阳将胡琴琴头的兽形雕刻与囚牛联系起来"]]
    ]
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

  function renderCard({ title, description, aliases, facts, id } = {}) {
    entry.replaceChildren();
    credit.replaceChildren();
    entry.hidden = !title;
    credit.hidden = !title;
    if (!title) return;

    entry.append(element("h3", title));
    if (description) entry.append(element("p", description, "entry-description"));
    if (aliases?.length) entry.append(element("p", `别名：${aliases.join("、")}`, "aliases"));
    if (facts?.length) {
      const list = element("dl", "", "facts");
      for (const [label, values] of facts) {
        const detail = element("dd");
        values.forEach((value, index) => {
          if (index) detail.append("、");
          detail.append(value);
        });
        list.append(element("dt", label), detail);
      }
      entry.append(list);
    }

    if (id) {
      credit.append("来源：", link(`Wikidata（${id}）`, `${wikidata}/wiki/${id}`));
    } else {
      credit.append("本地编写 · 参考 ", link(
        "李东阳《记龙生九子》",
        "https://www.shidianguji.com/book/HY1130/chapter/1kvmfclsw6ujm"
      ));
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

  async function runLookup(work, failure) {
    activeRequest?.abort();
    const controller = new AbortController();
    activeRequest = controller;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 7500);
    try {
      await work(controller.signal);
    } catch {
      if (activeRequest === controller) {
        status.textContent = timedOut ? "Wikidata 请求超时，请重试。" : failure;
      }
    } finally {
      clearTimeout(timer);
      if (activeRequest === controller) activeRequest = undefined;
    }
  }

  function localized(values = {}) {
    return languages.map(language => values[language]?.value).find(Boolean);
  }

  function isItemId(id) {
    return typeof id === "string" && /^Q[1-9]\d*$/.test(id);
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

  async function loadCard(hit, signal) {
    status.textContent = "正在加载词条…";
    renderCard({ title: hit.label, description: hit.description, id: hit.id });
    const { entities } = await getEntities([hit.id], "labels|descriptions|aliases|claims", signal);
    signal.throwIfAborted();
    const item = entities?.[hit.id] || Object.values(entities || {})[0];
    if (!item || Object.hasOwn(item, "missing")) throw new Error("Missing Wikidata item");
    const id = isItemId(item.id) ? item.id : hit.id;
    const title = localized(item.labels) || hit.label;
    const description = localized(item.descriptions) || hit.description;
    const aliases = languages.flatMap(language => item.aliases?.[language] || [])
      .map(alias => alias.value)
      .filter(alias => alias && alias !== title);
    const card = { title, description, aliases: [...new Set(aliases)].slice(0, 6), id };
    renderCard(card);

    const facts = factIds(item.claims);
    if (facts.length) {
      const ids = [...new Set(facts.flatMap(([, ids]) => ids))];
      const { entities: related } = await getEntities(ids, "labels", signal);
      signal.throwIfAborted();
      card.facts = facts.map(([label, values]) => [
        label,
        values.flatMap(value => {
          const name = localized(related?.[value]?.labels);
          return name ? [link(name, `${wikidata}/wiki/${value}`)] : [];
        })
      ]).filter(([, values]) => values.length);
      renderCard(card);
    }
    status.textContent = "";
  }

  function select(button) {
    for (const option of results.children) {
      option.setAttribute("aria-pressed", String(option === button));
    }
  }

  function resultButton(label, description) {
    const button = element("button", "", "result-option");
    button.type = "button";
    button.append(element("strong", label));
    if (description) button.append(element("span", description));
    results.append(button);
    return button;
  }

  form.addEventListener("submit", event => {
    event.preventDefault();
    const term = query.value.trim();
    const hasLocalCard = term === localCard.title;
    results.replaceChildren();
    renderCard(hasLocalCard ? localCard : undefined);
    if (!term) {
      activeRequest?.abort();
      activeRequest = undefined;
      status.textContent = "请输入查找的词语。";
      return;
    }

    status.textContent = "正在搜索 Wikidata…";
    runLookup(async signal => {
      const data = await getData({
        action: "wbsearchentities",
        search: term,
        language: "zh-hans",
        type: "item",
        limit: "6"
      }, signal);
      signal.throwIfAborted();
      const hits = (data.search || []).filter(hit => isItemId(hit.id) && hit.label);
      if (!hits.length) {
        status.textContent = "Wikidata 暂无匹配结果。";
        return;
      }

      const localButton = hasLocalCard ? resultButton(localCard.title, "内置词条") : null;
      localButton?.addEventListener("click", () => {
        activeRequest?.abort();
        activeRequest = undefined;
        select(localButton);
        renderCard(localCard);
        status.textContent = "";
      });
      const buttons = hits.map(hit => {
        const button = resultButton(hit.label, hit.description);
        button.addEventListener("click", () => {
          select(button);
          runLookup(signal => loadCard(hit, signal), "词条详情暂时无法加载，请重试。");
        });
        return button;
      });
      select(localButton || buttons[0]);
      if (hasLocalCard) status.textContent = "";
      else await loadCard(hits[0], signal);
    }, "Wikidata 资料暂时无法加载，请重试。");
  });

  renderCard(localCard);
})();
