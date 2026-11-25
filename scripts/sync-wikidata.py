"""Refresh the offline cards from Wikidata's CC0 structured data."""

import json
import re
import subprocess
import time
from pathlib import Path
from urllib.parse import urlencode


API = "https://www.wikidata.org/w/api.php"
USER_AGENT = "OnmyojiWordGuess/1.0 (https://github.com/rookie4show; public vocabulary refresh)"
LANGUAGES = ("zh-hans", "zh-cn", "zh", "zh-hant", "zh-tw", "zh-hk")
OUTPUT = Path(__file__).resolve().parents[1] / "data" / "wikidata-zh.json"

# Chinese sitelinks identify the intended item, including ambiguous names.
TITLES = """
囚牛 李白 指南针 大熊猫 杜甫 故宫
孔子 孟子 老子 庄子 屈原 司马迁 诸葛亮 曹操 刘备 关羽 张飞 秦始皇 汉武帝 武则天 唐太宗 成吉思汗 朱元璋 郑和 岳飞
苏轼 白居易 王维 李清照 辛弃疾 陶渊明 纳兰性德 曹雪芹 鲁迅 冰心 莫言 李时珍 祖冲之 蔡伦 毕昇 张衡 袁隆平 屠呦呦
阿尔伯特·爱因斯坦 艾萨克·牛顿 伽利略·伽利莱 玛丽·居里 查尔斯·达尔文 托马斯·爱迪生 威廉·莎士比亚 莱昂纳多·达·芬奇 路德维希·范·贝多芬 文森特·梵高
西游记 红楼梦 水浒传 三国演义 山海经 论语 史记 诗经 本草纲目 兰亭集序 清明上河图 静夜思 春晓 木兰诗 唐诗 宋词 活着_(小说) 小王子 哈姆雷特
孙悟空 猪八戒 沙悟净 哪吒 女娲 伏羲 盘古 后羿 嫦娥 夸父 嫦娥奔月 龙生九子 睚眦 饕餮 麒麟 凤凰 白泽 貔貅 雷震子 灶神 观世音 地藏菩萨
长城 秦始皇兵马俑 莫高窟 乐山大佛 布达拉宫 颐和园 天坛 西湖 三峡 长江 黄河 珠穆朗玛峰 青藏高原 大运河 丝绸之路
北京 上海 广州 成都 杭州 西安 拉萨 重庆 南京 香港 澳门 台北 东京 巴黎 伦敦 罗马 纽约 埃及 尼罗河 撒哈拉沙漠 太平洋 北冰洋 南极洲
太阳 月球 地球 火星 木星 土星 银河系 太阳系 黑洞 超新星 哈雷彗星 日食 月食 潮汐 地震 火山 彩虹 闪电 雪 沙尘暴 龙卷风 极光
相对论 光合作用 万有引力定律 元素周期表 细胞 脱氧核糖核酸 氧 氢 碳 铁 金 银 钻石 石墨 二氧化碳 水 食盐
火药 造纸术 印刷术 地动仪 望远镜 显微镜 温度计 自行车 铁路 火车 飞机 计算机 电话 电灯 电子邮件 互联网 二维码 计算器 智能手机
茶 咖啡 月饼 饺子 粽子 豆腐 书法 围棋 象棋 端午节 中秋节 春节 元宵节 皮影戏 京剧 唢呐 二胡 古筝 风筝 油纸伞 雨伞 折扇 筷子 毛笔 剪刀 钥匙 手表 蜡烛
猫 狗 马 驴 老虎 狮子 雪豹 红狐 北极熊 考拉 白鳍豚 江豚 蓝鲸 宽吻海豚 企鹅 鸵鸟 丹顶鹤 鸟翼凤蝶 蚊子 蚂蚁 蜜蜂 蜘蛛 水母 章鱼 珊瑚 鳄鱼 扬子鳄 蝙蝠 长颈鹿 鸭嘴兽 大白鲨 霸王龙 三角龙
竹 荷花 牡丹 银杏 梅 茶树 水稻 玉米 向日葵 马铃薯 菠萝 西瓜 草莓 榴莲 苹果 香蕉 番茄 辣椒
""".split()

# Use concise card labels for Wikidata properties. Order sets the display priority.
PROPERTIES = dict([
    ("P136", "体裁"), ("P170", "创作者"), ("P50", "作者"), ("P144", "取材于"),
    ("P1441", "登场作品"), ("P674", "角色"), ("P800", "代表作"), ("P106", "职业"),
    ("P569", "出生"), ("P570", "去世"), ("P19", "出生地"), ("P39", "担任职务"),
    ("P101", "领域"), ("P937", "工作地点"), ("P166", "所获奖项"),
    ("P61", "发现者或发明者"), ("P366", "用途"), ("P2283", "使用"),
    ("P186", "材料"), ("P571", "始建或创立"), ("P577", "发表或出版"),
    ("P131", "所在行政区"), ("P276", "所在地"), ("P17", "所在国家"), ("P30", "所在洲"),
    ("P1435", "遗产或保护认定"), ("P138", "得名于"), ("P495", "原产地"),
    ("P149", "建筑风格"), ("P840", "故事地点"), ("P921", "主题"), ("P407", "作品语言"),
    ("P225", "学名"), ("P171", "上级分类"), ("P141", "保护状况"), ("P105", "分类阶元"),
    ("P1582", "产自"), ("P361", "所属整体"), ("P527", "组成部分"),
    ("P279", "上位类别"), ("P31", "类别"), ("P1269", "相关领域"),
    ("P463", "所属团体"), ("P1066", "师从"), ("P802", "学生"),
    ("P460", "据称相同"),
])


def entities(parameter, keys, props):
    found = {}
    for start in range(0, len(keys), 35):
        query = {
            "action": "wbgetentities",
            "format": "json",
            "maxlag": 10,
            "languages": "|".join(LANGUAGES),
            "props": props,
            parameter: "|".join(keys[start:start + 35]),
        }
        if parameter == "titles":
            query.update(sites="zhwiki", redirects="yes", sitefilter="zhwiki")
        response = subprocess.check_output([
            "curl", "--fail", "--silent", "--show-error", "--compressed", "--max-time", "40",
            "--retry", "2", "--user-agent", USER_AGENT, f"{API}?{urlencode(query)}",
        ])
        payload = json.loads(response)
        if "error" in payload:
            raise RuntimeError(payload["error"])
        found.update({key: value for key, value in payload["entities"].items() if "missing" not in value})
        time.sleep(0.25)
    return found


def text_for(entity, field):
    term = entity.get(field, {})
    return next((term[language]["value"] for language in LANGUAGES if language in term), "")


def unique(values):
    return list(dict.fromkeys(value for value in values if value))


def values_for(entity, property_id):
    statements = [statement for statement in entity.get("claims", {}).get(property_id, [])
                  if statement["rank"] != "deprecated" and "datavalue" in statement["mainsnak"]]
    preferred = [statement for statement in statements if statement["rank"] == "preferred"]
    return [statement["mainsnak"]["datavalue"]["value"] for statement in preferred or statements]


def format_value(value, property_id, names):
    if isinstance(value, str) and property_id == "P225":
        return value
    if isinstance(value, dict):
        if "id" in value:
            return names.get(value["id"], "")
        if "time" in value and value["precision"] >= 9:
            year = int(value["time"].split("T")[0][1:].split("-")[0])
            era = "公元前" if value["time"].startswith("-") else ""
            return f"{era}{year}年"
    return ""


def build_cards(source, names):
    cards = []
    for item_id, item in source.items():
        types = {value.get("id") for value in values_for(item, "P31") if isinstance(value, dict)}
        if types & {"Q4167410", "Q13406463", "Q4167836"}:
            continue
        title = text_for(item, "labels")
        description = text_for(item, "descriptions")
        if not title or not re.search(r"[\u3400-\u9fff]", title):
            continue
        aliases = unique([item.get("labels", {}).get(language, {}).get("value") for language in LANGUAGES] + [
            alias["value"] for language in LANGUAGES for alias in item.get("aliases", {}).get(language, [])
        ])
        facts = []
        for property_id, label in PROPERTIES.items():
            if property_id == "P31" and types in ({"Q5"}, {"Q16521"}):
                continue
            values = unique(format_value(value, property_id, names) for value in values_for(item, property_id))
            values = [value for value in values if value != title]
            if values:
                facts.append([label, values[:5]])
        if description or facts:
            cards.append({"id": item_id, "title": title, "description": description,
                          "aliases": [alias for alias in aliases if alias != title and len(alias) <= 32][:14],
                          "facts": facts[:8]})
    return cards


def main():
    source = entities("titles", [title.replace("_", " ") for title in TITLES], "labels|descriptions|aliases|claims|sitelinks")
    print(f"Loaded {len(source)} source items")
    linked_ids = sorted({value["id"] for item in source.values() for property_id in PROPERTIES
                         for value in values_for(item, property_id)[:8] if isinstance(value, dict) and "id" in value})
    names = {key: text_for(item, "labels") for key, item in source.items()}
    missing_ids = [item_id for item_id in linked_ids if not names.get(item_id)]
    print(f"Loading Chinese labels for {len(missing_ids)} linked items")
    names.update({key: text_for(item, "labels") for key, item in entities("ids", missing_ids, "labels").items()})
    cards = build_cards(source, names)
    required = {"囚牛", "李白", "指南针", "大熊猫", "杜甫", "故宫"}
    if not required <= {card["title"] for card in cards} or len(cards) < 150:
        raise RuntimeError(f"Unexpected Wikidata result: {len(cards)} cards")
    with OUTPUT.open("w", encoding="utf-8") as file:
        file.write('{"items":[\n')
        file.write(",\n".join(json.dumps(card, ensure_ascii=False, separators=(",", ":")) for card in cards))
        file.write("\n]}\n")
    print(f"Wrote {len(cards)} cards to {OUTPUT}")


if __name__ == "__main__":
    main()
